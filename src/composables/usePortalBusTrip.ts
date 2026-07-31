/**
 * 隨車老師端娃娃車班次操作（`/portal/bus-trip` 專用，非 module singleton）。
 *
 * 三條主軸：
 * 1. **班次狀態**：進頁先問 `GET /portal/bus/trips/active`（只需 `BUS_TRIPS_OPERATE`），
 *    有進行中班次就直接接手；沒有才去載路線清單讓司機開新班次。
 * 2. **GPS 上報**：`watchPosition` 的高頻回呼交給 `@/utils/busPingBuffer` 節流成
 *    每 5 秒一批，再由本檔負責送出與**重送**。
 * 3. **站點推進**：離站／跳站／撤銷，回應的 `stops` 為權威值直接覆寫。
 *
 * ── 進頁復原：一次問「我的班次」（`mine=true`）───────────────────────────
 * `GET /portal/bus/trips/active` 不帶任何維度是**全域查詢**（後端 docstring 明文），會挑
 * 最近一筆 in_progress 的班次，任何路線、任何操作者皆可能。後端 `8836ecde` 補上
 * operator 維度後，進頁復原一律帶 `mine=true`（比對 `BusTrip.operator_employee_id`
 * 與 token 的 employee_id），**一次呼叫、不再逐路線試探**。
 *
 * 逐路線試探（本檔前一版）只是把「不確定拿到哪條」收斂成「確定拿到 id 最小的那條」：
 * A 線與 B 線同時在跑時，B 線司機開頁仍會接手 A 線的班次與完整名冊（學生姓名＋家庭
 * 座標），並把 B 車的 GPS 寫進 A 車的班次。`mine=true` 才真正堵住。
 *
 * ⚠ 兩件不可省的事：
 * 1. `GET /portal/bus/routes` **仍要打**——那是開班選單（沒有它司機無從選路線開班）。
 * 2. `mine=true` 遇上未綁員工的帳號時後端回 **403**（刻意不默默退化成「回任何人的」）。
 *    前端同樣不得吞掉：`employeeUnlinked` 旗標讓畫面明講「請先綁定員工資料」，
 *    因為這條路徑重試不會變好，而開班（`_require_employee_id`）同樣會 403。
 *
 * `tripSummary`（「路線・方向」）保留：接手來的班次未必是自己選的那條，
 * 而 `start()` 的 409 接手仍是以 route＋direction 限縮、非 operator 維度。
 *
 * ── 時間軸：一律以伺服器 `Date` header 校正 ────────────────────────────────
 * `busPingBuffer` 的時鐘暴衝防線擋得住「單顆時間戳暴衝」，擋不住「整支裝置時鐘系統性
 * 錯誤」。本檔把每支娃娃車 API 回應的 `Date` header 換算成偏差（`@/utils/serverClock`），
 * 之後 `at` 與 `nowAt` **同時**加上它：系統性偏差被校正回伺服器時間軸，單顆
 * `pos.timestamp` 暴衝則因為 `nowAt` 不受影響而仍被 skew 防線攔下。
 *
 * ── busPingBuffer 的五條契約在本檔的落點 ──────────────────────────────────
 * ① 每次 `push()` 都傳 `nowAt`（`reportPosition` 內唯一一處 push，無第二條路徑）
 * ② `push()` 只在 `start()`~`stop()` 之間有效 → `beginTracking` / `stopTracking` 成對
 * ③ 結束順序 `flushNow()` → `stop()` → 才送出（`stopTracking` 內固定順序）
 * ④ `pushPing` 不就地變更 → 本檔不持有 buffer 內部陣列，只從 `onFlush` 收批次
 * ⑤ `onFlush` 拋錯該批會遺失 → 故 `onFlush` **只把點搬進 outbox 不送網路**，送出與
 *    重送由本檔的 `shipOutbox` 負責（見下方「送出與重送」）
 *
 * ── 隱私（spec 硬規則）────────────────────────────────────────────────────
 * 站點座標與 GPS 座標都是位置資料：本檔不 log、不進任何 storage、不進 URL query，
 * 錯誤訊息一律用後端文案不夾帶座標；路線清單只留 `id`/`name`，回應裡的學生名冊
 * 與家庭座標不進前端狀態（連 Vue devtools 都看不到）。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  completeBusTrip, departBusStop, getActiveBusTrip, listPortalBusRoutes,
  postBusPings, skipBusStop, startBusTrip, undoBusStop,
} from '@/api/bus'
import {
  createPingBuffer, DEFAULT_MAX_SKEW_MS, MAX_BATCH_POINTS, type PingPoint,
} from '@/utils/busPingBuffer'
import { serverClockOffsetMs, serverNowIso } from '@/utils/serverClock'
import { apiError } from '@/utils/error'

/** 批次送出間隔（毫秒）；buffer 的節流週期與 outbox 的送出週期共用同一值。 */
export const PING_FLUSH_INTERVAL_MS = 5000

/**
 * 連續幾顆 `pos.timestamp` 都偏離本機「現在」超過 skew 門檻，就判定為「這支瀏覽器的
 * timestamp 不是 Unix epoch 基準」（系統性），改用本機時間標記。**偶發單顆暴衝不算**
 * ——那是 busPingBuffer 的 skew 防線該擋的，clamp 掉會讓整條防線失去作用。
 */
export const SUSPECT_TIMESTAMP_STREAK = 3

/** 方向的中文標籤；後端 `direction` 只有這兩個值（`TripStartIn` 的 pattern 限定）。 */
export const DIRECTION_LABELS: Record<string, string> = {
  morning: '早上接學生',
  afternoon: '下午送學生',
}

/**
 * 後端 `PingIn` 對站點與班次回應的形狀（`api/bus/_schemas.py`）。
 * `src/api/_generated/schema.d.ts` 尚未涵蓋 `/bus` 路徑，故在此以最小欄位 narrow；
 * codegen 補上後應改用產生型別（比照 `src/parent/composables/useBusTracking.ts`）。
 */
export interface BusTripStop {
  stop_id: number
  student_id: number
  student_name: string
  seq: number
  status: string
  departed_at?: string | null
}
export interface BusTripBrief {
  id: number
  route_id: number
  direction: 'morning' | 'afternoon'
  status: string
  started_at?: string | null
}
interface ActivePayload { trip?: BusTripBrief | null; stops?: BusTripStop[] | null }

type ApiHeaders = { headers?: Record<string, unknown> }

function errorStatus(e: unknown): number | undefined {
  return (e as { response?: { status?: number } } | null)?.response?.status
}

export function usePortalBusTrip() {
  const trip = ref<BusTripBrief | null>(null)
  const stops = ref<BusTripStop[]>([])
  const routes = ref<Array<{ id: number; name: string }>>([])
  const selectedRouteId = ref<number | null>(null)
  const direction = ref<'morning' | 'afternoon'>('morning')
  const loading = ref(true)
  const starting = ref(false)
  const completing = ref(false)
  const actingStopId = ref<number | null>(null)
  /** 定位權限被拒／取不到位置：家長端只看得到站點進度，UI 要明講。 */
  const gpsActive = ref(false)
  const gpsSupported = ref(true)
  /** 進頁快照失敗：**不可**當成「沒有班次」而顯示開班卡（會開出第二張班次）。 */
  const snapshotFailed = ref(false)
  /**
   * `mine=true` 查詢遭 403：此帳號未綁員工資料。與一般快照失敗分開呈現——
   * 一般失敗按「重新載入」有機會好，這條不會（開班也會 403），要有人去後台綁定。
   */
  const employeeUnlinked = ref(false)
  /** 裝置回報的定位時間不是 epoch 基準：已改用系統時間標記，UI 要讓司機看得到。 */
  const gpsClockSuspect = ref(false)
  const pendingPingCountRef = ref(0)
  const pendingPingCount = computed(() => pendingPingCountRef.value)
  /**
   * 「A 線・早上接學生」。班次進行中一定要顯示——後端還沒有 operator 維度的過濾，
   * 多路線並行時有可能接手到別條路線的班次，這一行是司機唯一能自己察覺的訊號。
   * 一律取自 `trip.route_id`（**不是** `selectedRouteId`）：接手來的班次未必是自己選的那條，
   * 用選單值會顯示成「看起來沒問題」，正好把要暴露的問題蓋掉。
   */
  const tripSummary = computed(() => {
    const t = trip.value
    if (!t) return ''
    const name = routes.value.find((r) => r.id === t.route_id)?.name ?? `路線 #${t.route_id}`
    return `${name}・${DIRECTION_LABELS[t.direction] ?? t.direction}`
  })

  // 本機時鐘相對伺服器的偏差；每支娃娃車 API 回應都會更新。
  let clockOffsetMs = 0
  let watchId: number | null = null
  let wakeLockSentinel: { release?: () => Promise<void> } | null = null
  let shipTimer: ReturnType<typeof setInterval> | null = null
  let suspectTimestampStreak = 0
  let shipping = false
  /**
   * 待送出的點。**刻意不是 reactive**：座標不必進 Vue 響應式系統（devtools 可見），
   * UI 只需要筆數。上限與後端 `PingBatchIn.points` 的 `max_length` 一致，滿了丟最舊
   * ——保住「最近的軌跡」，這是家長端會看的部分。
   */
  let outbox: PingPoint[] = []

  function setOutbox(points: PingPoint[]): void {
    outbox = points.length > MAX_BATCH_POINTS ? points.slice(-MAX_BATCH_POINTS) : points
    pendingPingCountRef.value = outbox.length
  }

  /** 從任一回應的 `Date` header 更新時鐘偏差；取不到就沿用既有值（不歸零）。 */
  function syncClock(res: ApiHeaders | undefined): void {
    const offset = serverClockOffsetMs(res?.headers?.date, Date.now())
    if (offset !== null) clockOffsetMs = offset
  }

  const buffer = createPingBuffer({
    flushIntervalMs: PING_FLUSH_INTERVAL_MS,
    // 契約⑤：onFlush 拋錯該批就沒了，所以這裡只做不會失敗的事（搬進 outbox），
    // 真正的網路送出與重送在 shipOutbox。
    onFlush: (points: PingPoint[]) => setOutbox([...outbox, ...points]),
  })

  // ── GPS 上報 ──────────────────────────────────────────────────────────────

  function reportPosition(pos: GeolocationPosition): void {
    gpsActive.value = true
    const localNow = Date.now()
    // 裝置偶爾會吐出壞掉的 timestamp；退回「校正後的現在」而不是讓這個點被丟掉。
    const rawTs = Number.isFinite(pos.timestamp) ? pos.timestamp : localNow
    // 極少數瀏覽器的 GeolocationPosition.timestamp 是相對時間基準而非 Unix epoch。
    // 那會讓**每一個**點都偏離 nowAt 超過門檻而被 buffer 拒收，且 gpsActive 仍是 true、
    // 待送筆數恆為 0——司機與家長端都看不到任何異常訊號。連續多顆都偏離才判定為系統性
    // 並改用本機時間（同時亮出 UI 訊號）；單顆暴衝仍原樣送進 buffer 由 skew 防線拒收。
    suspectTimestampStreak = Math.abs(rawTs - localNow) > DEFAULT_MAX_SKEW_MS
      ? suspectTimestampStreak + 1
      : 0
    // **刻意單向不可逆**：一旦判定「這支裝置回報的 timestamp 不可信」，就整支改用本機
    // 時間，此後單顆暴衝也一併放行——因為「單顆暴衝」這個概念的前提（其餘 timestamp
    // 可信）已經不成立了。不是漏掉重置：能讓它歸零的訊號並不存在（裝置不會中途換一套
    // timestamp 基準），加一條會歸零的路徑只會讓行為在兩種模式間來回跳。
    if (suspectTimestampStreak >= SUSPECT_TIMESTAMP_STREAK) gpsClockSuspect.value = true
    const rawAt = gpsClockSuspect.value ? localNow : rawTs
    buffer.push(
      {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        at: serverNowIso(rawAt, clockOffsetMs),
      },
      // 契約①：nowAt 必傳。這是 per-call 檢查，漏一次那顆暴衝的時間戳就會進緩衝
      // 並成為後續所有點的節流基準。
      serverNowIso(localNow, clockOffsetMs),
    )
  }

  async function shipOutbox(): Promise<void> {
    const tripId = trip.value?.id
    if (shipping || !tripId || outbox.length === 0) return
    const batch = outbox
    setOutbox([])
    shipping = true
    try {
      const res = await postBusPings(tripId, batch)
      syncClock(res as ApiHeaders)
    } catch (e) {
      const status = errorStatus(e)
      if (status === 409 || status === 404) {
        // 班次已在他處結束／不存在：留著也送不出去，收工。
        handleTripGone()
      } else if (status !== undefined && status >= 400 && status < 500) {
        // 4xx（含 422 整批含不合法點、403 權限被撤）重送不會變好——留著只會變成
        // 每 5 秒重試一次的毒藥批次，把後續正常的點一起卡住。整批丟棄。
        ElMessage.warning('部分位置資料未能上報，家長端仍看得到站點進度')
      } else {
        // 網路／5xx：放回 outbox 最前面（比新收的點舊），下一輪一起送。
        setOutbox([...batch, ...outbox])
      }
    } finally {
      shipping = false
    }
  }

  async function acquireWakeLock(): Promise<void> {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<unknown> } }
    if (!nav.wakeLock) return
    try {
      wakeLockSentinel = (await nav.wakeLock.request('screen')) as { release?: () => Promise<void> }
    } catch {
      // 不支援／被瀏覽器拒絕就靠司機自己不鎖屏；不是錯誤路徑，不打擾使用者。
    }
  }

  /**
   * 分頁回前景時 Wake Lock 已被瀏覽器釋放，必須重新取得，否則螢幕會在路上熄掉。
   * 「是否還在追蹤」單純由監聽器的註冊／移除決定（`beginTracking`/`stopTracking`
   * 成對），這裡不再重複判一次 `watchId`——兩道等價守衛只會讓其中一道永遠測不到。
   *
   * 轉 hidden 時把已收集的點推出去：`onBeforeUnmount` 在「關分頁／App 被系統回收」
   * 這兩種情境都不會觸發，而 `visibilitychange` 是行動瀏覽器唯一可靠的「即將離開」
   * 訊號——隨車老師的手機正是最常被系統回收的那一類。
   */
  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      void acquireWakeLock()
      return
    }
    buffer.flushNow()
    void shipOutbox()
  }

  function beginTracking(): void {
    if (watchId !== null) return
    if (!('geolocation' in navigator)) { gpsSupported.value = false; return }
    // 契約②：push() 只在 start()~stop() 之間有效 —— 先 start 再掛回呼，避免第一個
    // 回呼落在啟動前而被靜默丟掉。
    buffer.start()
    watchId = navigator.geolocation.watchPosition(
      reportPosition,
      () => { gpsActive.value = false },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    )
    // 送出計時器**在 buffer.start() 之後**註冊：同週期的兩個計時器依註冊順序觸發，
    // 於是每一輪都是「buffer 先把批次搬進 outbox，再由這裡送出」，不會延後一輪。
    shipTimer = setInterval(() => { void shipOutbox() }, PING_FLUSH_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    void acquireWakeLock()
  }

  function stopTracking(): void {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    // 契約③：先 flushNow 再 stop —— 反過來 stop() 會清掉尚未送出的最後一批。
    buffer.flushNow()
    buffer.stop()
    if (shipTimer !== null) { clearInterval(shipTimer); shipTimer = null }
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void wakeLockSentinel?.release?.()
    wakeLockSentinel = null
    gpsActive.value = false
  }

  function handleTripGone(): void {
    stopTracking()
    setOutbox([])
    trip.value = null
    stops.value = []
    ElMessage.warning('班次已結束，已停止位置上報')
  }

  // ── 班次載入 ──────────────────────────────────────────────────────────────

  function applyActive(data: ActivePayload | undefined): void {
    if (data?.trip) {
      trip.value = data.trip
      stops.value = data.stops ?? []
      beginTracking()
    } else if (trip.value) {
      handleTripGone()
    }
  }

  /**
   * 取進行中的班次。**至少要帶一個維度**（後端一個都不帶時是全域查詢，多路線同時開班
   * 會回到別條路線的完整站點名冊＝學生姓名與家庭座標）：已知路線時帶 route/direction，
   * 進頁復原沒有已知路線，改帶 `mine=true`。
   */
  async function loadActive(
    routeId?: number | null,
    dir?: 'morning' | 'afternoon' | null,
    mine = false,
  ): Promise<void> {
    const res = await getActiveBusTrip(routeId ?? null, dir ?? null, mine)
    syncClock(res as ApiHeaders)
    applyActive((res as { data?: ActivePayload }).data)
  }

  /** 開班選單（`GET /portal/bus/routes`，與開班同權限、不含站點名冊）。失敗往上拋。 */
  async function loadRoutes(): Promise<void> {
    const res = await listPortalBusRoutes()
    syncClock(res as ApiHeaders)
    const raw = (res as { data?: { routes?: Array<{ id: number; name: string; is_active: boolean }> } })
      .data?.routes ?? []
    // 只留 id/name；`is_active` 過濾是防禦（端點已只回啟用中，欄位仍在 schema 裡）。
    routes.value = raw.filter((r) => r.is_active).map((r) => ({ id: r.id, name: r.name }))
    selectedRouteId.value = routes.value.length === 1 ? routes.value[0].id : null
  }

  /**
   * 查「我的」進行中班次：**單次呼叫**，不逐路線試探（那撈的是「id 最小的那條」，
   * 也就是別人的班次）。403 代表帳號未綁員工——標記後往上拋，由 `init` 統一呈現。
   */
  async function findActiveTrip(): Promise<void> {
    try {
      await loadActive(null, null, true)
    } catch (e) {
      // 只認「查我的班次」這一支的 403；路線清單的 403 是缺 BUS_TRIPS_OPERATE，
      // 兩者的處置完全不同（找 HR 綁員工 vs 找管理員開權限），不可混為一談。
      if (errorStatus(e) === 403) employeeUnlinked.value = true
      throw e
    }
  }

  async function init(): Promise<void> {
    loading.value = true
    snapshotFailed.value = false
    employeeUnlinked.value = false
    try {
      await loadRoutes()
      await findActiveTrip()
    } catch (e) {
      // 失敗不得謊稱「沒有班次」：那會讓司機再開一張，撞上後端 409 或開錯方向。
      snapshotFailed.value = true
      ElMessage.error(employeeUnlinked.value
        ? apiError(e, '此帳號尚未綁定員工資料，請洽行政人員綁定後再重新載入')
        : apiError(e, '載入班次失敗，請重試'))
    } finally {
      loading.value = false
    }
  }

  async function start(): Promise<void> {
    const routeId = selectedRouteId.value
    if (!routeId) { ElMessage.error('請先選擇路線'); return }
    starting.value = true
    try {
      const res = await startBusTrip(routeId, direction.value)
      syncClock(res as ApiHeaders)
      applyActive((res as { data?: ActivePayload }).data)
    } catch (e) {
      if (errorStatus(e) === 409) {
        // 已有進行中班次（含昨天忘記按結束的）：以自己這條路線＋方向限縮接手。
        ElMessage.warning('已有進行中的班次，為您接手')
        try {
          await loadActive(routeId, direction.value)
        } catch (inner) {
          ElMessage.error(apiError(inner, '接手班次失敗，請重新整理'))
        }
      } else {
        ElMessage.error(apiError(e, '開始班次失敗'))
      }
    } finally {
      starting.value = false
    }
  }

  // ── 站點推進 ──────────────────────────────────────────────────────────────

  async function runStopAction(
    call: (tripId: number, stopId: number) => Promise<unknown>,
    stop: { stop_id: number },
    fallbackMessage: string,
  ): Promise<void> {
    const current = trip.value
    if (!current || actingStopId.value !== null) return
    actingStopId.value = stop.stop_id
    try {
      const res = await call(current.id, stop.stop_id)
      syncClock(res as ApiHeaders)
      stops.value = (res as { data?: { stops?: BusTripStop[] } }).data?.stops ?? []
    } catch (e) {
      ElMessage.error(apiError(e, fallbackMessage))
      if (errorStatus(e) === 409) {
        // 此站已被別人處理／班次已結束：畫面與後端已分岔，重抓權威狀態。
        await loadActive(current.route_id, current.direction).catch(() => {})
      }
    } finally {
      actingStopId.value = null
    }
  }

  const departStop = (stop: { stop_id: number }) => runStopAction(departBusStop, stop, '離站失敗')
  const skipStop = (stop: { stop_id: number }) => runStopAction(skipBusStop, stop, '跳過失敗')
  const undoStop = (stop: { stop_id: number }) => runStopAction(undoBusStop, stop, '撤銷失敗')

  // ── 結束班次 ──────────────────────────────────────────────────────────────

  async function complete(): Promise<void> {
    const current = trip.value
    if (!current || completing.value) return
    try {
      await ElMessageBox.confirm(
        '確定結束本班次？結束後家長端即看不到車輛位置。', '結束班次',
        { type: 'warning', confirmButtonText: '結束班次', cancelButtonText: '再看看' },
      )
    } catch {
      return // 使用者取消：追蹤照舊，不動任何狀態
    }
    completing.value = true
    // 先停止收集並送出最後一批：班次一旦 completed，後端 `_active_trip_or_404`
    // 會對上報回 409，這批點就再也送不出去了。
    stopTracking()
    await shipOutbox()
    const leftover = outbox.length
    try {
      const res = await completeBusTrip(current.id)
      syncClock(res as ApiHeaders)
    } catch (e) {
      // 結束失敗表示班次仍在跑，必須恢復追蹤——否則司機以為結束了，家長端卻停在
      // 最後一個座標。
      ElMessage.error(apiError(e, '結束班次失敗，請再試一次'))
      beginTracking()
      completing.value = false
      return
    }
    setOutbox([])
    trip.value = null
    stops.value = []
    completing.value = false
    ElMessage.success('班次已結束')
    if (leftover > 0) ElMessage.warning('最後一批位置未能上報，不影響班次結束')
  }

  function teardown(): void {
    stopTracking()
    void shipOutbox()
  }

  return {
    trip, stops, routes, selectedRouteId, direction,
    loading, starting, completing, actingStopId,
    gpsActive, gpsSupported, gpsClockSuspect, snapshotFailed, employeeUnlinked,
    pendingPingCount, tripSummary,
    init, start, departStop, skipStop, undoStop, complete, teardown,
  }
}
