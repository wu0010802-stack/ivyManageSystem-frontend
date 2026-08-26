/**
 * 隨車老師端娃娃車班次操作（`/portal/bus-trip` 專用，非 module singleton）。
 *
 * 三條主軸：
 * 1. **班次狀態**：進頁**並行**打 `GET /portal/bus/trips/active?mine=true` 與
 *    `GET /portal/bus/routes`（兩支都只需 `BUS_TRIPS_OPERATE`）——有進行中班次就直接
 *    接手，沒有才用班次列表讓司機開新班次。兩支各自判定成敗，見下方 `init`。
 *    開班選單自 BE-API-PORTAL-01 起是**班次列表**（單方向、含出發時間與當日四態），
 *    司機不再自己選方向——方向由班次衍生。
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
 * `tripSummary`（「班次名稱・方向」）保留：接手來的班次未必是自己選的那條，
 * 而 `start()` 的 409 接手仍是以 route 限縮、非 operator 維度。
 *
 * ⚠ **`mine=true` 的必然代價（使用者可見）**：司機**中途換手**後，接手的老師重載頁面
 * 會查不到那一班——`operator_employee_id` 仍是原司機，`mine=true` 依定義就不回它。
 * 回得來，但要走「選路線 → 開始班次 → 後端 409 → 自動接手」這條路，多一次點擊。
 * 這是刻意的取捨：拿「換手後多一次點擊」換掉「B 線司機靜默接手 A 線的完整名冊
 * 並把 GPS 寫進別人的班次」。要同時解決需後端提供 operator 維度的**換手登記**，
 * 非前端可補。
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
 * 錯誤訊息一律用後端文案不夾帶座標。
 *
 * ⚠ 第二期揭露面放寬（spec「司機端（Portal）」）：站點卡片要顯示**接送地址與
 * 聯絡人電話**，因此 `stops` 內確實持有地址與電話——這是 `BUS_TRIPS_OPERATE`
 * 授權範圍內的刻意揭露，但「不進 log／Sentry／URL／storage」的既有硬規則
 * **完全不變**，反而更重要（電話比座標更容易被順手 log 出來）。開班選單
 * （`routes`）仍不含任何名冊，只有班次本身的中繼資料。
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

/**
 * 週期性核對「班次是否仍存在」的間隔（毫秒）。**不能靠 shipOutbox 的 409/404**（唯一既有
 * 偵測路徑）——GPS 因權限被拒或裝置不支援而完全沒有點時，outbox 永遠是空的，那條路徑
 * 形同失效，班次被 `bus_maintenance_scheduler` 逾時關閉或被另一台裝置結束時，司機畫面
 * 會永遠停在「進行中」。
 *
 * 訂 60 秒：這支查詢（`GET /portal/bus/trips/active`）比 GPS ping 重（要撈站點清單），
 * 拉太密只是浪費行動網路流量換不到多少即時性——「班次已消失」不是那種需要秒級反應的
 * 狀態，晚一分鐘讓司機看到已經足夠好；分頁回前景時另外核對一次補上「剛好卡在週期中間」
 * 的空窗，兩者合起來已經足夠及時。
 */
export const ACTIVE_TRIP_RESYNC_INTERVAL_MS = 60_000

/** 方向的中文標籤；後端 `direction` 只有這兩個值（`ck_bus_routes_direction` 限定）。 */
export const DIRECTION_LABELS: Record<string, string> = {
  morning: '早上接學生',
  afternoon: '下午送學生',
}

/**
 * 後端 `PingIn` 對站點與班次回應的形狀（`api/bus/_schemas.py`）。
 * `src/api/_generated/schema.d.ts` 尚未涵蓋 `/bus` 路徑，故在此以最小欄位 narrow；
 * codegen 補上後應改用產生型別（比照 `src/parent/composables/useBusTracking.ts`）。
 */
/** 接送聯絡人（後端已依 is_primary／is_emergency／fallback 規則挑好，前端不再篩）。 */
export interface BusStopContact {
  name: string
  phone: string | null
}

export interface BusTripStop {
  stop_id: number
  student_id: number
  student_name: string
  seq: number
  /**
   * `pending`／`departed`／`skipped`／`excused`。
   *
   * ⚠ 契約破壞（spec「第一期契約破壞清單」）：第一期的 `on_leave` 即時查詢已
   * 移除，**`excused` 是「當日不搭」的單一事實來源**（請假核准／家長今天不搭／
   * 後台排除三條路徑都落成 excused）。司機端對 excused 站不提供任何操作，也
   * **不**提供恢復——第一期「標示請假但仍要司機自己按跳過」的語意整個退場。
   */
  status: string
  /** `leave`／`parent`／`admin`；status 為 excused 時才有值。 */
  excuse_reason?: string | null
  source?: string | null
  pinned?: boolean
  /** 接送地址快照（＝所選接送地址，不一定是住家）。 */
  address?: string | null
  contacts?: BusStopContact[]
  /** 最佳化排定的 ETA（naive 台北牆鐘 ISO 字串）。 */
  eta_planned?: string | null
  /** 行進間動態重算的 ETA；有值時優先於 `eta_planned`。 */
  eta_live?: string | null
  lat?: number | null
  lng?: number | null
  departed_at?: string | null
}

/**
 * 開班選單的一筆班次（`GET /portal/bus/routes`，BE-API-PORTAL-01）。
 *
 * `today_status` 四態（spec「司機端（Portal）」）：
 * - `none`：今日尚無班次（`expired` 也歸此態，開班走懶生成）
 * - `planned`：今日已排定但未發車（開班＝接手轉 in_progress）
 * - `in_progress`：今日進行中
 * - `completed`：今日已完成，**仍可再開同日第二趟**
 *
 * 後端 openapi 只標 `type: string`（無 enum），故型別上是 string，此處以聯集
 * narrow 供 UI 分支；收到未知值時一律當 `none` 處理（見 `normalizeTodayStatus`）。
 */
export type BusRouteTodayStatus = 'none' | 'planned' | 'in_progress' | 'completed'

export interface BusRouteBrief {
  id: number
  name: string
  direction: 'morning' | 'afternoon'
  depart_time: string
  sort_order: number
  today_status: BusRouteTodayStatus
  today_trip_id: number | null
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

const TODAY_STATUSES: readonly BusRouteTodayStatus[] = ['none', 'planned', 'in_progress', 'completed']

/**
 * 後端 openapi 對 `today_status` 只標 `type: string`（無 enum），型別上拿到的是
 * string。未知值一律當 `none`——保守方向：`none` 的 UI 是「可開班」，最壞情況是
 * 司機按下去讓後端擋，而不是把一班真的能開的車顯示成不能開。
 */
function normalizeTodayStatus(raw: unknown): BusRouteTodayStatus {
  return TODAY_STATUSES.includes(raw as BusRouteTodayStatus)
    ? (raw as BusRouteTodayStatus)
    : 'none'
}

export function usePortalBusTrip() {
  const trip = ref<BusTripBrief | null>(null)
  const stops = ref<BusTripStop[]>([])
  const routes = ref<BusRouteBrief[]>([])
  const selectedRouteId = ref<number | null>(null)
  const loading = ref(true)
  /**
   * 發車被擋下的原因（422：缺座標／超座位上限）。**刻意不是 toast**：司機在
   * 車上、手邊在忙，一閃即逝的提示看不到就再也回不來，而這兩種錯誤都要人去
   * 後台改資料才會好，訊息必須留在畫面上直到下一次嘗試。
   */
  const startBlockedMessage = ref<string | null>(null)
  const starting = ref(false)
  const completing = ref(false)
  const actingStopId = ref<number | null>(null)
  /** 定位權限被拒／取不到位置：家長端只看得到站點進度，UI 要明講。 */
  const gpsActive = ref(false)
  const gpsSupported = ref(true)
  /**
   * `PositionError.code === 1`（PERMISSION_DENIED）——與其他定位失敗（POSITION_UNAVAILABLE
   * / TIMEOUT）分開呈現：`watchPosition` 一旦被拒，之後不會再自動跳權限提示，司機唯一的
   * 出路是自己去瀏覽器或系統設定開權限，「重新整理」對這條路徑沒有用。拿到一次真實位置
   * 就解除（代表權限後來被開了）。
   */
  const gpsPermissionDenied = ref(false)
  /** 進頁快照失敗：**不可**當成「沒有班次」而顯示開班卡（會開出第二張班次）。 */
  const snapshotFailed = ref(false)
  /**
   * 帳號未綁員工資料。與一般快照失敗分開呈現——一般失敗按「重新載入」有機會好，
   * 這條不會（開班也會 403），要有人去後台綁定。
   * ⚠ **判別靠兩支請求的結果組合**（見 `init`），不是單看 active 那支的狀態碼。
   */
  const employeeUnlinked = ref(false)
  /**
   * 開班選單（`GET /portal/bus/routes`）載入失敗。與 `snapshotFailed` **分開**：
   * 路線清單掛掉只該擋住「開新班次」，不該連帶讓行駛中的班次查不到而停掉 GPS。
   * 也不得退化成「尚未設定娃娃車路線」的空狀態（那會讓司機去追不存在的問題）。
   */
  const routesFailed = ref(false)
  /** 裝置回報的定位時間不是 epoch 基準：已改用系統時間標記，UI 要讓司機看得到。 */
  const gpsClockSuspect = ref(false)
  const pendingPingCountRef = ref(0)
  const pendingPingCount = computed(() => pendingPingCountRef.value)
  /**
   * 待重送的站點動作（離站/跳過/撤銷）。**刻意不是「一個 boolean」**——多個站的動作可能
   * 各自因短暫斷訊而排隊，司機要看得到「還有幾個」，而且是持續存在的狀態（不是會自動
   * 消失的 toast）：行駛中訊號短暫中斷時司機不會盯著螢幕看，toast 消失後就再也看不到。
   */
  const stopRetryQueue = ref<Array<{
    kind: 'depart' | 'skip' | 'undo'
    tripId: number
    stopId: number
    fallbackMessage: string
  }>>([])
  const pendingStopActionCount = computed(() => stopRetryQueue.value.length)
  /**
   * 「A 線・早上接學生」。班次進行中一定要顯示：進頁復原雖已用 `mine=true` 收斂到
   * 「我的班次」，但 `start()` 的 409 接手仍以 route 限縮（非 operator 維度）
   * ——接到的未必是自己按下去的那一班，這一行是司機自己察覺的訊號。
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
  let resyncTimer: ReturnType<typeof setInterval> | null = null
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
    // 拿到真實位置就代表權限沒問題（可能是司機事後去設定開了權限）：解除舊旗標，
    // 否則畫面會在權限其實已經恢復後繼續顯示過時的「請去開權限」提示。
    gpsPermissionDenied.value = false
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
      // 分頁在背景的這段時間班次可能已被結束，不必等到下一個 60 秒週期——這是
      // 「司機把手機切回這頁」的當下，正是最該立刻告訴他真相的時機。
      void resyncActiveTrip()
      return
    }
    buffer.flushNow()
    void shipOutbox()
  }

  /** 背景計時器與 visibilitychange 是否已註冊；獨立於 `watchId`，因為不支援定位的
   * 裝置永遠不會有 `watchId`，但仍要跑站點重試佇列與週期性核對（見下方 Task 2 註解）。
   */
  let trackingActive = false

  function beginTracking(): void {
    if ('geolocation' in navigator) {
      if (watchId === null) {
        // 契約②：push() 只在 start()~stop() 之間有效 —— 先 start 再掛回呼，避免第一個
        // 回呼落在啟動前而被靜默丟掉。
        buffer.start()
        watchId = navigator.geolocation.watchPosition(
          reportPosition,
          (err) => {
            gpsActive.value = false
            // code 1 = PERMISSION_DENIED（W3C Geolocation spec）；2 = POSITION_UNAVAILABLE、
            // 3 = TIMEOUT 都是「暫時取不到位置」，重試／等待有機會自己好，與權限被拒是
            // 完全不同的可行動指引，不得混為一談。
            const code = (err as GeolocationPositionError | null | undefined)?.code
            gpsPermissionDenied.value = code === 1
          },
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
        )
      }
    } else {
      // Task 2：裝置不支援定位——沒有 watchId、沒有 GPS 點，但站點重試佇列（純靠
      // 網路）與週期性核對（`resyncActiveTrip` 的存在理由正是涵蓋「完全沒有 GPS
      // 點」的情境，見其註解）不該因此被連帶卡死，故不 return，繼續往下註冊計時器。
      gpsSupported.value = false
    }
    if (trackingActive) return
    trackingActive = true
    // 送出計時器**在 buffer.start() 之後**註冊：同週期的兩個計時器依註冊順序觸發，
    // 於是每一輪都是「buffer 先把批次搬進 outbox，再由這裡送出」，不會延後一輪。
    // 同一顆計時器也順帶處理站點動作的重送佇列：兩者都是「網路恢復後自動補送」，
    // 不必為此另開一顆計時器。GPS 不支援時 shipOutbox 內部本來就會因 outbox 恆空
    // 而是 no-op，retryStopActions 不受影響。
    shipTimer = setInterval(() => {
      void shipOutbox()
      void retryStopActions()
    }, PING_FLUSH_INTERVAL_MS)
    // 週期性核對班次是否仍存在（見 `resyncActiveTrip` 註解）：獨立於 ping 管線，
    // 只要還在追蹤中就跑，與 GPS 是否真的有點無關。
    resyncTimer = setInterval(() => { void resyncActiveTrip() }, ACTIVE_TRIP_RESYNC_INTERVAL_MS)
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
    if (resyncTimer !== null) { clearInterval(resyncTimer); resyncTimer = null }
    document.removeEventListener('visibilitychange', onVisibilityChange)
    trackingActive = false
    void wakeLockSentinel?.release?.()
    wakeLockSentinel = null
    gpsActive.value = false
  }

  function handleTripGone(): void {
    stopTracking()
    setOutbox([])
    // 班次已消失，佇列裡待重送的站點動作已無意義（該班次的端點只會回 404/409）。
    stopRetryQueue.value = []
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
   * 不依賴 ping 管線的週期性核對：GPS 完全沒有點（權限被拒／不支援定位）時
   * `shipOutbox` 的 409/404 偵測路徑恆不觸發，班次被排程器逾時關閉或被另一台裝置
   * 結束時司機畫面會永遠停在「進行中」。用既有路線＋方向重查一次（**非** `mine=true`
   * ——理由與 `start()` 的 409 接手一致：司機中途換手後仍要能核到「班次還在」）。
   *
   * 失敗（網路／5xx）刻意靜默：這是背景核對不是使用者觸發的動作，用會打斷司機的
   * toast 呈現「查核暫時失敗」沒有意義——真正的「班次消失了」會在下一輪核對到，
   * 或被 `shipOutbox`／站點操作的 409/404 分支先一步抓到。
   */
  async function resyncActiveTrip(): Promise<void> {
    const current = trip.value
    if (!current) return
    try {
      const res = await getActiveBusTrip(current.route_id, null)
      syncClock(res as ApiHeaders)
      const data = (res as { data?: ActivePayload }).data
      // 這支查詢**不帶** `mine=true`（理由見上方註解：司機中途換手後仍要能核到
      // 「班次還在」），代價是同一班次若已被另一位司機開了新的一趟，
      // 回傳的會是「別人的班次」——不同 `trip.id`。這裡只用來核對「我手上這張
      // 是否還在」，絕不可拿別人的 trip.id 覆寫過來：那會讓這支裝置的畫面載入
      // 別人班次的學生姓名與家庭座標（PII），並把自己的 GPS 灌進別人的班次。
      // trip.id 不同（含 null）一律視為「我的班次已消失」。
      if (data?.trip && data.trip.id !== current.id) {
        handleTripGone()
        return
      }
      applyActive(data)
    } catch {
      // 靜默忽略，見上方註解。
    }
  }

  /**
   * 取進行中的班次。**至少要帶一個維度**（後端一個都不帶時是全域查詢，多路線同時開班
   * 會回到別條路線的完整站點名冊＝學生姓名、家庭座標與聯絡電話）：已知班次時帶
   * `route_id`，進頁復原沒有已知班次，改帶 `mine=true`。
   */
  async function loadActive(routeId?: number | null, mine = false): Promise<void> {
    // `direction` 一律不帶：班次已是單方向（bussch03），route_id 本身就決定了
    // 方向，多帶一個維度只會在「後端 trip.direction 與 route.direction 不同步」
    // 這種資料異常時把查得到的班次濾掉。
    const res = await getActiveBusTrip(routeId ?? null, null, mine)
    syncClock(res as ApiHeaders)
    applyActive((res as { data?: ActivePayload }).data)
  }

  /**
   * 開班選單（`GET /portal/bus/routes`，與開班同權限、不含站點名冊）。失敗往上拋。
   *
   * BE-API-PORTAL-01 起是**班次列表**（單方向、含出發時間與當日四態），不再是
   * 「路線 × 自己選方向」。依 `sort_order` 排序（後端已排，這裡再排一次是防禦：
   * 排序是司機找班次的唯一線索，不該押在「後端一定照順序回」）。
   */
  async function loadRoutes(): Promise<void> {
    const res = await listPortalBusRoutes()
    syncClock(res as ApiHeaders)
    const raw = (res as { data?: { routes?: Array<Record<string, unknown>> } })
      .data?.routes ?? []
    // `is_active` 過濾是防禦（端點已只回啟用中，欄位仍在 schema 裡）。
    routes.value = raw
      .filter((r) => r.is_active !== false)
      .map((r): BusRouteBrief => ({
        id: Number(r.id),
        name: String(r.name ?? ''),
        direction: r.direction === 'afternoon' ? 'afternoon' : 'morning',
        depart_time: typeof r.depart_time === 'string' ? r.depart_time : '',
        sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
        today_status: normalizeTodayStatus(r.today_status),
        today_trip_id: typeof r.today_trip_id === 'number' ? r.today_trip_id : null,
      }))
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    selectedRouteId.value = routes.value.length === 1 ? routes.value[0].id : null
  }

  /**
   * 查「我的」進行中班次：**單次呼叫**，不逐路線試探（那撈的是「id 最小的那條」，
   * 也就是別人的班次）。錯誤一律往上拋，由 `init` 依兩支請求的組合判定。
   */
  async function findActiveTrip(): Promise<void> {
    await loadActive(null, true)
  }

  /**
   * 進頁：**兩支請求並行、各自判定**。
   *
   * 為什麼不能串行（前一版是 `await loadRoutes()` 才 `await findActiveTrip()`）：
   * 路線清單只是開班選單，它 5xx 時若連帶讓班次查不到，司機行駛中重載頁面就會
   * 停掉 GPS 上報——家長端完全看不到車。那個串行原本的安全理由是「沒有路線清單
   * 就只能做全域查詢」，改用 `mine=true` 之後已經消失。
   *
   * 兩種 403 的判別（後端兩支端點掛同一個 `_operate_dep`，缺權限時**兩支都 403**）：
   * - 兩支都 403 → 缺 `BUS_TRIPS_OPERATE`，是權限問題；
   * - 路線清單**拿得到**（＝權限沒問題）但查我的班次 403 → 才是未綁 employee。
   * 刻意**不靠後端訊息字串**（文案一改就失效），也**不靠執行順序**
   * ——串行時是「routes 先炸所以 findActiveTrip 沒跑到」這個意外才沒誤判的。
   */
  async function init(): Promise<void> {
    loading.value = true
    const [routesResult, activeResult] = await Promise.allSettled([loadRoutes(), findActiveTrip()])
    // 三個旗標一律**無條件賦值**：只設不清會讓上一輪的錯誤卡黏在成功的這一輪上。
    routesFailed.value = routesResult.status === 'rejected'
    // 失敗不得謊稱「沒有班次」：那會讓司機再開一張，撞上後端 409 或開錯方向。
    snapshotFailed.value = activeResult.status === 'rejected'
    employeeUnlinked.value = routesResult.status === 'fulfilled'
      && activeResult.status === 'rejected'
      && errorStatus(activeResult.reason) === 403
    if (activeResult.status === 'rejected') {
      ElMessage.error(employeeUnlinked.value
        ? apiError(activeResult.reason, '此帳號尚未綁定員工資料，請洽行政人員綁定後再重新載入')
        : apiError(activeResult.reason, '載入班次失敗，請重試'))
    } else if (routesResult.status === 'rejected') {
      // 班次查得到就不是「什麼都不知道」，只是這一趟開不了新班次
      ElMessage.error(apiError(routesResult.reason, '載入路線清單失敗，暫時無法開始新班次'))
    }
    loading.value = false
  }

  /**
   * 開班。契約破壞（spec「第一期契約破壞清單—POST /portal/bus/trips」）：
   * **不再帶 `direction`**，方向由班次衍生；「有今日 planned 就接手轉
   * in_progress、沒有就懶生成再轉」整段由後端處理，前端不先打 daily-plans。
   *
   * 錯誤分流：
   * - 409：已有進行中班次（含昨天忘按結束的）→ 沿用既有接手邏輯，但限縮維度
   *   從「route＋direction」降為 **route_id 單維度**（班次已是單方向）。
   *   bus_count 併發上限也是 409，但那種情況查不到自己的班次，接手會落空，
   *   由 `loadActive` 後的空結果 + 後端訊息呈現。
   * - 422：發車驗證失敗（缺座標／超座位上限）→ 留在畫面上的持久訊息，見
   *   `startBlockedMessage`。
   */
  async function start(): Promise<void> {
    const routeId = selectedRouteId.value
    if (!routeId) { ElMessage.error('請先選擇班次'); return }
    starting.value = true
    startBlockedMessage.value = null
    try {
      const res = await startBusTrip(routeId)
      syncClock(res as ApiHeaders)
      applyActive((res as { data?: ActivePayload }).data)
    } catch (e) {
      if (errorStatus(e) === 409) {
        ElMessage.warning('已有進行中的班次，為您接手')
        try {
          await loadActive(routeId)
        } catch (inner) {
          ElMessage.error(apiError(inner, '接手班次失敗，請重新整理'))
        }
        // 接手落空（例如 409 其實是 bus_count 達上限，這條路線並沒有我的班次）：
        // 不可靜默停在「沒有班次」的畫面，那看起來像什麼都沒發生。
        if (!trip.value) startBlockedMessage.value = apiError(e, '目前無法開始班次')
      } else if (errorStatus(e) === 422) {
        startBlockedMessage.value = startValidationMessage(e)
      } else {
        ElMessage.error(apiError(e, '開始班次失敗'))
      }
    } finally {
      starting.value = false
    }
  }

  /**
   * 發車驗證 422 的訊息。缺座標那條後端帶 `student_ids`——**故意不顯示 id**
   * （司機看不懂學號序號，顯示出來只是雜訊，也把內部識別碼帶進了畫面），
   * 只補上「共 N 位」讓司機知道要請行政補幾筆。
   */
  function startValidationMessage(e: unknown): string {
    const base = apiError(e, '發車前檢查未通過')
    const detail = (e as { response?: { data?: { detail?: unknown } } } | null)
      ?.response?.data?.detail
    const ids = detail && typeof detail === 'object' && !Array.isArray(detail)
      ? (detail as { student_ids?: unknown }).student_ids
      : null
    return Array.isArray(ids) && ids.length > 0 ? `${base}（共 ${ids.length} 位）` : base
  }

  // ── 站點推進 ──────────────────────────────────────────────────────────────

  type StopActionKind = 'depart' | 'skip' | 'undo'

  const STOP_ACTION_CALLS: Record<StopActionKind, (tripId: number, stopId: number) => Promise<unknown>> = {
    depart: departBusStop,
    skip: skipBusStop,
    undo: undoBusStop,
  }

  /** 套用站點動作回應的權威 `stops`，並呈現後端新增的 `notification_warning`。 */
  function applyStopResponse(res: unknown): void {
    const data = (res as { data?: { stops?: BusTripStop[]; notification_warning?: boolean } }).data
    stops.value = data?.stops ?? []
    if (data?.notification_warning) {
      // 落庫已成功，只是發家長通知失敗：不是錯誤，是輕量提示，不得用 ElMessage.error
      // （那會讓司機以為操作失敗而重按，反而製造真正的重複操作）。
      ElMessage.warning('操作已成功，家長通知可能延遲')
    }
  }

  function enqueueStopRetry(item: {
    kind: StopActionKind; tripId: number; stopId: number; fallbackMessage: string
  }): void {
    // 同一站已在佇列裡就不重複加：`runStopAction` 本身用 `actingStopId` 擋掉同站的
    // 第二次手動操作，這裡是防禦（例如未來呼叫路徑變多時）。
    if (stopRetryQueue.value.some((q) => q.stopId === item.stopId && q.kind === item.kind)) return
    stopRetryQueue.value = [...stopRetryQueue.value, item]
  }

  /**
   * 只清掉「同站＋同 kind」的那一筆。**不可只比 stopId**：enqueue 以 `stopId+kind`
   * 去重，代表同一站可能同時排著 depart 與 skip（例如司機離站後又立刻按撤銷／跳過，
   * 中途都因斷訊各自進了佇列）——只比 stopId 會讓其中一筆成功時把另一筆也靜默清掉，
   * 該動作永遠送不出去也不會有任何提示。這裡選擇「各 kind 獨立追蹤」而非「同站新動作
   * 覆寫舊動作」：後者需要在 enqueue 時主動剔除同站其他 kind，會把「跳過」誤判成
   * 「取代離站」，但兩者是使用者兩個不同的意圖，不該由前端替司機決定何者作廢。
   */
  function dequeueStopRetry(stopId: number, kind: StopActionKind): void {
    stopRetryQueue.value = stopRetryQueue.value.filter(
      (q) => !(q.stopId === stopId && q.kind === kind),
    )
  }

  /**
   * 站點動作的實際執行＋錯誤分流，供「使用者手動觸發」與「背景自動重送」共用。
   * `isRetry` 只影響要不要再彈一次 toast：手動觸發第一次失敗要立刻讓司機知道，
   * 背景重送每 5 秒失敗一次若也彈 toast 會變成灌爆畫面的噪音。
   */
  async function performStopAction(
    kind: StopActionKind,
    tripId: number,
    stopId: number,
    fallbackMessage: string,
    isRetry = false,
  ): Promise<void> {
    try {
      const res = await STOP_ACTION_CALLS[kind](tripId, stopId)
      syncClock(res as ApiHeaders)
      applyStopResponse(res)
      dequeueStopRetry(stopId, kind)
    } catch (e) {
      const status = errorStatus(e)
      if (status === 409) {
        dequeueStopRetry(stopId, kind)
        // 重送觸發的 409 代表**已經成功**（自己或別人先前的嘗試已落庫），是冪等意義上
        // 的完成，不是新錯誤——只有手動觸發的第一次才彈錯誤（此站與畫面已分岔要讓司機
        // 知道）。背景重送不是新錯誤，但也不能完全靜默：那會讓司機以為自己剛才排隊的
        // 那次操作成功了，其實是被別的裝置先一步改了狀態——用 info（非 error，避免
        // 誘發司機重按）明講一次。
        if (!isRetry) {
          ElMessage.error(apiError(e, fallbackMessage))
        } else {
          ElMessage.info('此站狀態已由其他裝置更新')
        }
        const current = trip.value
        if (current) await loadActive(current.route_id).catch(() => {})
        return
      }
      if (status !== undefined && status < 500) {
        // 4xx 非 409（403 權限、404 站點不存在等）：重試不會變好，直接呈現，不進佇列。
        dequeueStopRetry(stopId, kind)
        ElMessage.error(apiError(e, fallbackMessage))
        return
      }
      // 網路（無 response）或 5xx：進重試佇列，靠持續存在的 UI 狀態（而非會消失的
      // toast）讓司機知道還有動作沒送出去；手動觸發的第一次仍彈一次即時提示。
      if (!isRetry) ElMessage.error(apiError(e, fallbackMessage))
      enqueueStopRetry({ kind, tripId, stopId, fallbackMessage })
    }
  }

  let retryingStopActions = false
  /** 由 `shipTimer` 每輪順帶呼叫；重送順序依佇列先進先出，逐筆 await 避免打亂 stops 覆寫順序。 */
  async function retryStopActions(): Promise<void> {
    if (retryingStopActions || stopRetryQueue.value.length === 0) return
    retryingStopActions = true
    try {
      const items = [...stopRetryQueue.value]
      for (const item of items) {
        // 刻意序列化（不用 Promise.all）：逐筆 await 才能維持 stops 覆寫的時序，
        // 且與 shipOutbox 的併發守衛精神一致。
        await performStopAction(item.kind, item.tripId, item.stopId, item.fallbackMessage, true)
      }
    } finally {
      retryingStopActions = false
    }
  }

  /**
   * `excused` 站一律不可操作（spec「司機端（Portal）」：灰態、且**不提供恢復**）。
   *
   * UI 已經不會渲染這些按鈕，這道守衛是縱深防禦：excused 的三種來源（請假核准／
   * 家長今天不搭／後台排除）都是「這孩子今天不在車上」的既成事實，司機端誤按
   * 離站等於在系統裡記下一筆沒發生過的接送。以 `stops` 內的權威狀態判定，不信
   * 呼叫端傳進來的物件——重排／resync 後呼叫端手上的可能是舊的。
   */
  function isExcused(stopId: number): boolean {
    return stops.value.find((s) => s.stop_id === stopId)?.status === 'excused'
  }

  async function runStopAction(
    kind: StopActionKind,
    stop: { stop_id: number },
    fallbackMessage: string,
  ): Promise<void> {
    const current = trip.value
    if (!current || actingStopId.value !== null) return
    if (isExcused(stop.stop_id)) return
    actingStopId.value = stop.stop_id
    try {
      await performStopAction(kind, current.id, stop.stop_id, fallbackMessage)
    } finally {
      actingStopId.value = null
    }
  }

  const departStop = (stop: { stop_id: number }) => runStopAction('depart', stop, '離站失敗')
  const skipStop = (stop: { stop_id: number }) => runStopAction('skip', stop, '跳過失敗')
  const undoStop = (stop: { stop_id: number }) => runStopAction('undo', stop, '撤銷失敗')

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
    // 班次已正式結束，佇列裡待重送的站點動作已無意義（同 handleTripGone 的理由）。
    stopRetryQueue.value = []
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
    trip, stops, routes, selectedRouteId,
    loading, starting, completing, actingStopId, startBlockedMessage,
    gpsActive, gpsSupported, gpsClockSuspect, gpsPermissionDenied,
    snapshotFailed, employeeUnlinked, routesFailed,
    pendingPingCount, pendingStopActionCount, tripSummary,
    init, start, departStop, skipStop, undoStop, complete, teardown,
  }
}
