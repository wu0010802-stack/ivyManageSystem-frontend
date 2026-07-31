/**
 * 管理端娃娃車即時監看（`/bus-monitor` 專用，非 module singleton）。
 *
 * 資料來源兩條，兩條都必須存在：
 * - HTTP 快照 `GET /api/bus/trips/today?route_id=`：進頁、換路線、重連、輪詢降級時的權威基準
 * - WS `/api/ws/admin/bus`：行駛中的增量事件（admin channel 是**全園共用**的，
 *   所有路線的事件都會進來，因此每一則都必須自行比對班次／路線）
 *
 * ── 依 repo 實況修正 brief 之處（brief 的片段有三個會實際壞掉的地方）──────────
 *
 * 1. **admin channel 收不到 `bus_trip_started`**。`api/bus/portal_trips.py::start_trip`
 *    只對家長 channel 推 `build_trip_started_event`，`publish_admin` 一次都沒呼叫
 *    （grep `publish_admin` 只有 `_push_stop_update` / `complete_trip` /
 *    `bus_maintenance_scheduler`）。brief 監看頁把「新班次發車」寄託在
 *    `bus_trip_started` 上，那是永遠不會觸發的死分支——車已經上路，監看頁還顯示
 *    「今日尚無班次」，直到有人手動重新整理。
 *    本檔改以「收到不認識的班次事件就回頭抓一次快照」補上這個缺口：
 *    - `bus_stop_update` 帶完整 `trip`（含 `route_id`），同路線的新班次直接接手；
 *    - `bus_position` 只帶 `trip_id`，無法判斷路線，故走**節流 + 負向快取**的探測
 *      （`UNKNOWN_TRIP_PROBE_INTERVAL_MS` 內至多探一次；探完仍非本路線就記入
 *      `foreignTripIds`，之後同一班次的位置事件直接丟棄）。沒有節流的話，別條
 *      路線每 5 秒一顆的 GPS 就會變成每 5 秒一次快照請求。
 *
 * 2. **每則事件都要比對班次**。brief 的 `bus_position` / `bus_stop_update` 直接覆寫
 *    state，但 admin channel 是全園共用：早上 A 線與 B 線同時在跑時，畫面上 A 線的
 *    車會被 B 線的座標拖著走，站點清單也會被另一條路線的名冊整包換掉。
 *
 * 3. **快照一律帶 `route_id`**。不帶參數是全域查詢（後端 docstring 明文），會回到
 *    「今天剛好排序在最前面」的那條路線，管理者以為自己在看 A 線。
 *
 * ── 連線狀態只有兩態：正常 / 斷線重連中 ─────────────────────────────────────
 * `/api/ws/admin/bus` 的 4001/4007/4029/1008 全部在 `ws.accept()` **之前** close，
 * ASGI 未 accept 就 close 會退回 HTTP 握手失敗，瀏覽器只看得到 1006。唯一到得了
 * client 的自訂碼是 post-accept 的 4003（access token 15 分鐘到期的正常現象）。
 * 因此**不做**「權限不足請聯絡管理員」這類 UI 與狀態——那是永遠不觸發的死程式。
 * 4003 走「先重抓快照借道 axios 401 攔截器 refresh，再重連」，使用者無感。
 *
 * ── 隱私 ────────────────────────────────────────────────────────────────────
 * 管理端本就看得到學生姓名與家庭座標（`BUS_READ`），但座標仍**不得**進 console /
 * Sentry / URL query / localStorage / sessionStorage / page title。本檔因此完全沒有
 * console 與 storage 呼叫；路線清單只留 `id`/`name`/`is_active`，
 * `GET /api/bus/routes` 一併回傳的全車名冊與座標不進本檔狀態。
 */
import { computed, ref } from 'vue'
import {
  classifyWebSocketClose,
  closeWebSocketSafely,
  WS_LIVENESS_TIMEOUT_MS,
  WS_RECOVERY_RETRY_MS,
} from '@/utils/ws'
import { parseTaipeiDate } from '@/utils/taipeiTime'
import { getBusTripToday, listBusRoutes } from '@/api/bus'

/** 快速重試次數；用盡後改輪詢並低頻嘗試恢復（比照家長端與教師端接送提醒）。 */
const WS_MAX_RETRIES = 5
const WS_BACKOFF_BASE_MS = 1000
const WS_BACKOFF_MAX_MS = 30000
/** WS 斷線降級時的快照輪詢頻率。 */
export const POLL_INTERVAL_MS = 15000
/** 與後端 api/parent_portal/bus.py::STALE_THRESHOLD_SECONDS（60 秒）同口徑。 */
export const STALE_AFTER_MS = 60000
const STALE_TICK_MS = 10000
/** 不認識的班次事件的探測節流：別條路線的 GPS 每 5 秒一顆，不節流就是每 5 秒一次快照。 */
export const UNKNOWN_TRIP_PROBE_INTERVAL_MS = 30000

export const DIRECTION_LABELS: Record<string, string> = {
  morning: '早上接學生',
  afternoon: '下午送學生',
}

/**
 * 後端 `api/bus/_schemas.py` 的 `BusTripAdminOut` / `BusStopAdminOut` 最小欄位。
 * `src/api/_generated/schema.d.ts` 尚未涵蓋 `/bus` 路徑（codegen 需後端先 dump
 * openapi.json），故在此以本地 interface + runtime narrow 承接，比照
 * `usePortalBusTrip.ts` 與 `src/parent/composables/useBusTracking.ts`。
 */
export interface BusMonitorTrip {
  id: number
  route_id: number
  direction: string
  status: string
  auto_closed: boolean
  started_at: string | null
  last_ping_at: string | null
  last_lat: number | null
  last_lng: number | null
}
export interface BusMonitorStop {
  stop_id: number
  student_id: number
  student_name: string
  seq: number
  status: string
  lat: number | null
  lng: number | null
  departed_at: string | null
}
export interface BusMonitorRoute {
  id: number
  name: string
  is_active: boolean
}

// ── 型別 narrow（禁 any；codegen 涵蓋 /bus 後可退場）──
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function normalizeTrip(raw: unknown): BusMonitorTrip | null {
  const r = asRecord(raw)
  const id = r ? asNum(r.id) : null
  const routeId = r ? asNum(r.route_id) : null
  if (r === null || id === null || routeId === null) return null
  return {
    id,
    route_id: routeId,
    direction: asStr(r.direction) ?? '',
    status: asStr(r.status) ?? '',
    auto_closed: r.auto_closed === true,
    started_at: asStr(r.started_at),
    last_ping_at: asStr(r.last_ping_at),
    last_lat: asNum(r.last_lat),
    last_lng: asNum(r.last_lng),
  }
}

/** 回傳 null 代表「payload 沒帶站點」，呼叫端應保留既有清單而非清空。 */
function normalizeStops(raw: unknown): BusMonitorStop[] | null {
  if (!Array.isArray(raw)) return null
  return raw.map((item) => {
    const r = asRecord(item) ?? {}
    return {
      stop_id: asNum(r.stop_id) ?? 0,
      student_id: asNum(r.student_id) ?? 0,
      student_name: asStr(r.student_name) ?? '',
      seq: asNum(r.seq) ?? 0,
      status: asStr(r.status) ?? 'pending',
      lat: asNum(r.lat),
      lng: asNum(r.lng),
      departed_at: asStr(r.departed_at),
    }
  })
}

export function useBusMonitor() {
  const routes = ref<BusMonitorRoute[]>([])
  const selectedRouteId = ref<number | null>(null)
  const trip = ref<BusMonitorTrip | null>(null)
  const stops = ref<BusMonitorStop[]>([])
  const loading = ref(true)
  /**
   * 快照失敗（403 / 500）。**不可**當成「今天沒有班次」——那會把「連不上」呈現成
   * 「沒有車在跑」，是這一頁最不該說的謊。
   */
  const snapshotFailed = ref(false)
  const wsConnected = ref(false)
  /** 是否真的斷過線；只看 wsConnected 的話進頁必先閃一次「連線中斷」。 */
  const wsEverClosed = ref(false)
  /** 由 STALE_TICK_MS 推動的重算節拍；只影響 `stale` computed。 */
  const nowTick = ref(Date.now())

  let ws: WebSocket | null = null
  let retries = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null
  let livenessTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let staleTimer: ReturnType<typeof setInterval> | null = null
  let visibilityHandler: (() => void) | null = null
  let disposed = false
  let authRecovering = false

  /** 已確認「不是目前這條路線」的班次；之後它的位置事件一律丟棄，不再探測。 */
  const foreignTripIds = new Set<number>()
  /**
   * 已由 WS 告知結束的班次。`bus_trip_completed` 之後補抓的快照可能還讀到舊狀態
   * （或晚到的舊快照），沒有這道覆寫就會把已回校的車重新畫成行駛中。
   * 與家長端 `useBusTracking` 的 `completedTripIds` 同一設計。
   *
   * **班次狀態是終態**（`selectRoute` 的 clear 與「沒有 delete」都建立在這個前提上）：
   * 後端 `BusTrip.status` 全 repo 只有兩處寫入，且都寫成 `"completed"`——
   * `api/bus/portal_trips.py:407`（手動結束）與
   * `services/bus_maintenance_scheduler.py:74`（逾時自動關閉）；
   * `models/bus.py:46` 的 `default="in_progress"` 只在建構新 row 時生效（新 id，
   * 不構成 reopen），DB 另有 `ck_bus_trips_status_domain` 鎖住值域。
   * 因此集合裡的 id 永遠不可能再合法變回 `in_progress`。
   * ⚠ **將來若後端加了 reopen 端點，這裡要一起回來改**（覆寫會把復活的班次壓回
   * completed），連同 `selectRoute` 的 `completedTripIds.clear()`（該行目前是狀態
   * 衛生、非行為性，mutation 實測等價，故刻意沒有對應測試——寫了會是恆真斷言）。
   */
  const completedTripIds = new Set<number>()
  let lastUnknownProbeAt = 0
  let probing = false
  /** 快照發出序號：換路線／晚到的回應不得回填到新選擇上。 */
  let fetchSeq = 0

  const isLive = computed(() => trip.value?.status === 'in_progress')
  const stale = computed(() => {
    if (!isLive.value) return false
    const at = parseTaipeiDate(trip.value?.last_ping_at)
    if (!at) return false
    return nowTick.value - at.getTime() > STALE_AFTER_MS
  })
  /** 只有「進行中 + 有座標 + 不 stale + 快照沒失敗」才准把地圖當即時位置呈現。 */
  const showMap = computed(
    () => isLive.value
      && trip.value?.last_lat != null
      && trip.value?.last_lng != null
      && !stale.value
      && !snapshotFailed.value,
  )
  const reconnecting = computed(() => !wsConnected.value && wsEverClosed.value)
  const tripSummary = computed(() => {
    const t = trip.value
    if (!t) return ''
    const name = routes.value.find((r) => r.id === t.route_id)?.name ?? `路線 #${t.route_id}`
    return `${name}・${DIRECTION_LABELS[t.direction] ?? t.direction}`
  })

  // ── HTTP 快照 ──────────────────────────────────────────────────────────────

  /**
   * 抓今日班次快照。**一律帶 route_id**：不帶是全域查詢，會回到別條路線的班次與
   * 完整站點名冊，管理者卻以為自己在看選定的那條。
   * 回傳是否成功，供 `probeUnknownTrip` 判斷可否把班次記入負向快取。
   */
  async function refresh(): Promise<boolean> {
    const routeId = selectedRouteId.value
    if (routeId === null) {
      trip.value = null
      stops.value = []
      loading.value = false
      return false
    }
    const mySeq = ++fetchSeq
    try {
      const res = await getBusTripToday(routeId)
      // 換路線或有更新的 fetch 已發出 → 丟棄這份快照
      if (disposed || mySeq !== fetchSeq) return false
      const data = asRecord((res as { data?: unknown }).data) ?? {}
      const nextTrip = normalizeTrip(data.trip)
      // 已收過結束事件的班次一律覆寫回 completed，不論這份快照多舊——已回校的車
      // 不該在畫面上復活成行駛中（`auto_closed` 等其他欄位仍以快照為準）。
      trip.value = nextTrip && completedTripIds.has(nextTrip.id)
        ? { ...nextTrip, status: 'completed' }
        : nextTrip
      stops.value = normalizeStops(data.stops) ?? []
      snapshotFailed.value = false
      return true
    } catch {
      // 錯誤內容一律不進狀態（後端訊息可能夾帶識別資訊），只留旗標讓 UI 誠實降級
      if (!disposed && mySeq === fetchSeq) snapshotFailed.value = true
      return false
    } finally {
      if (!disposed && mySeq === fetchSeq) loading.value = false
    }
  }

  /** 路線清單。只留 `id`/`name`/`is_active`——同一支端點回傳的全車名冊與家庭座標不進狀態。 */
  async function loadRoutes(): Promise<void> {
    const res = await listBusRoutes()
    const data = asRecord((res as { data?: unknown }).data) ?? {}
    const raw = Array.isArray(data.routes) ? data.routes : []
    routes.value = raw.flatMap((item) => {
      const r = asRecord(item)
      const id = r ? asNum(r.id) : null
      if (r === null || id === null) return []
      return [{ id, name: asStr(r.name) ?? `路線 #${id}`, is_active: r.is_active !== false }]
    })
    if (selectedRouteId.value === null) {
      // 停用路線不會有新班次，預設挑第一條啟用中的；全停用時才退回第一條
      const active = routes.value.find((r) => r.is_active)
      selectedRouteId.value = active?.id ?? routes.value[0]?.id ?? null
    }
  }

  async function selectRoute(routeId: number): Promise<void> {
    if (routeId === selectedRouteId.value) return
    selectedRouteId.value = routeId
    // 換路線＝換一整份資料，舊路線的判定結果全部作廢
    foreignTripIds.clear()
    completedTripIds.clear()
    lastUnknownProbeAt = 0
    trip.value = null
    stops.value = []
    loading.value = true
    await refresh()
  }

  // ── WS 事件 ────────────────────────────────────────────────────────────────

  /**
   * 收到不認識的班次事件時回頭抓一次快照（補 admin channel 沒有
   * `bus_trip_started` 的缺口）。節流 + 負向快取避免別條路線的 GPS 造成快照風暴。
   */
  async function probeUnknownTrip(tripId: number): Promise<void> {
    if (probing) return
    const now = Date.now()
    if (now - lastUnknownProbeAt < UNKNOWN_TRIP_PROBE_INTERVAL_MS) return
    lastUnknownProbeAt = now
    probing = true
    try {
      const ok = await refresh()
      // 快照失敗時**不得**記入負向快取：那會讓這個班次永遠不再被探測，
      // 而它可能正是本路線剛發車的那一班。
      if (ok && trip.value?.id !== tripId) foreignTripIds.add(tripId)
    } finally {
      probing = false
    }
  }

  function handleEvent(event: Record<string, unknown>): void {
    const type = asStr(event.type)
    const payload = asRecord(event.payload) ?? {}
    if (type === 'bus_position') {
      const tripId = asNum(payload.trip_id)
      const lat = asNum(payload.lat)
      const lng = asNum(payload.lng)
      if (tripId === null || lat === null || lng === null) return
      const current = trip.value
      if (!current || current.id !== tripId) {
        // 別條路線的車（或本路線剛發車、我們還不知道的新班次）
        if (!foreignTripIds.has(tripId)) void probeUnknownTrip(tripId)
        return
      }
      trip.value = { ...current, last_lat: lat, last_lng: lng, last_ping_at: asStr(payload.at) }
      // 剛收到 server 推播的座標，定義上就是新鮮的；快照失敗的降級也可以解除
      nowTick.value = Date.now()
      snapshotFailed.value = false
    } else if (type === 'bus_stop_update') {
      const nextTrip = normalizeTrip(payload.trip)
      const nextStops = normalizeStops(payload.stops)
      if (!nextTrip || !nextStops) return
      if (nextTrip.route_id !== selectedRouteId.value) {
        // 別條路線：連帶記住它，之後它的位置事件不必再探測
        foreignTripIds.add(nextTrip.id)
        return
      }
      // 同路線即接手（可能是本路線剛發車、我們還沒收到快照的新班次）
      trip.value = nextTrip
      stops.value = nextStops
      foreignTripIds.delete(nextTrip.id)
      // 這裡刻意**沒有** `completedTripIds.delete(nextTrip.id)`（家長端的
      // `bus_trip_started` 分支有）：班次狀態是終態（見 completedTripIds 的宣告），
      // 已結束的班次不會再吐出 in_progress 的事件，那行在本檔不可達。
      // 待後端補上 admin 端 `bus_trip_started` 推播、本分支併入該事件時，此論證不變。
      snapshotFailed.value = false
    } else if (type === 'bus_trip_completed') {
      const tripId = asNum(payload.trip_id)
      if (tripId === null) return
      const current = trip.value
      // 顯示中的是別班次 → 與本頁無關（這道早退必須排在 add 之前，否則別條路線的
      // 結束事件也會被記進覆寫集合，且會多打一次快照）
      if (current && current.id !== tripId) return
      // **先記錄、才早退**：首次快照還在 in-flight 時 `trip.value` 仍是 null，
      // 此時無從標記狀態，但仍必須記下 id——否則晚到的 `in_progress` 快照會把
      // 已回校的車復活成行駛中，而且此後不會再有該班次的事件來修正，畫面會一路
      // 顯示「行駛中」直到 60 秒後 stale 介入，說成「位置訊號暫時中斷」（更難診斷的謊）。
      // 與家長端 `src/parent/composables/useBusTracking.ts:276-291` 同語意。
      completedTripIds.add(tripId)
      if (!current) return
      trip.value = { ...current, status: 'completed' }
      // payload 只有 `{trip_id}`（手動結束與 `bus_maintenance_scheduler` 的逾時自動
      // 關閉共用同一形狀），沿用舊的 `auto_closed: false` 會把「司機忘了按結束」的
      // 營運告警顯示成一般結束。WS 正常時沒有任何其他路徑會修正它（不重連就不
      // refresh、不降級就不輪詢），所以在這裡補抓一次快照取回 `auto_closed`。
      void refresh()
    }
  }

  // ── liveness / 輪詢 / 重連 ─────────────────────────────────────────────────

  function clearLiveness(): void {
    if (livenessTimer) {
      clearTimeout(livenessTimer)
      livenessTimer = null
    }
  }

  /** 每收到任何訊息（含後端 ping）就續命；逾時代表半開死亡，主動踢掉重連。 */
  function bumpLiveness(): void {
    clearLiveness()
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    livenessTimer = setTimeout(() => {
      if (!ws) return
      closeWebSocketSafely(ws)
      ws = null
      wsConnected.value = false
      wsEverClosed.value = true
      scheduleReconnect()
    }, WS_LIVENESS_TIMEOUT_MS)
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function startPolling(): void {
    stopPolling()
    pollTimer = setInterval(() => { void refresh() }, POLL_INTERVAL_MS)
  }

  function degradeToPolling(): void {
    startPolling()
    if (!recoveryTimer) {
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null
        connectWs()
      }, WS_RECOVERY_RETRY_MS)
    }
  }

  function scheduleReconnect(): void {
    if (disposed) return
    if (retries < WS_MAX_RETRIES) {
      const delay = Math.min(WS_BACKOFF_BASE_MS * Math.pow(2, retries), WS_BACKOFF_MAX_MS)
      retries++
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(connectWs, delay)
    } else {
      degradeToPolling()
    }
  }

  /**
   * 4003（token 週期重驗失敗）：先重抓快照，借道 `src/api/index.ts` 的 401 攔截器
   * 跑 refresh，再重連。retries 不歸零，持續失敗仍會退化為輪詢，不會變成無窮迴圈。
   */
  async function recoverAuthAndReconnect(): Promise<void> {
    if (authRecovering) return
    authRecovering = true
    try {
      await refresh()
    } finally {
      authRecovering = false
    }
    if (!disposed) scheduleReconnect()
  }

  function connectWs(): void {
    if (disposed) return
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    // token 由 httpOnly cookie 自動攜帶，**不得**放進 URL query
    const socket = new WebSocket(`${proto}://${location.host}/api/ws/admin/bus`)
    ws = socket

    // 以 socket instance identity 守衛所有 handler：被替換掉的舊 socket 若延遲吐出
    // 事件，一律忽略，避免污染新連線的狀態、誤排重連或誤清 liveness。
    socket.onopen = () => {
      if (ws !== socket) return
      wsConnected.value = true
      retries = 0
      stopPolling()
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
      bumpLiveness()
      // 補回「快照發出到 subscribe 成功」之間漏掉的事件
      void refresh()
    }
    socket.onmessage = (e) => {
      if (ws !== socket) return
      bumpLiveness()
      try {
        const event = asRecord(JSON.parse(e.data))
        if (!event) return
        // 後端 _recv_loop 90 秒收不到任何 client 訊息就主動斷線，ping 必須回應
        if (event.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }))
          return
        }
        handleEvent(event)
      } catch {
        /* 非 JSON 訊息忽略 */
      }
    }
    socket.onerror = () => {
      if (ws !== socket) return
      wsConnected.value = false
    }
    socket.onclose = (event) => {
      if (ws !== socket) return
      ws = null
      wsConnected.value = false
      wsEverClosed.value = true
      clearLiveness()
      // permission / rate-limit 分類在 admin channel 到不了 client（全在 accept 前
      // close，瀏覽器只看得到 1006），故不為它們做分支；4003 走 refresh 後重連。
      if (classifyWebSocketClose(event).kind === 'auth') {
        void recoverAuthAndReconnect()
        return
      }
      scheduleReconnect()
    }
  }

  /** 立刻換一條連線（回前景 / UI 手動重試）。 */
  function retryWs(): void {
    if (disposed) return
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
    closeWebSocketSafely(ws)
    ws = null
    retries = 0
    connectWs()
  }

  function onVisibility(): void {
    if (document.visibilityState !== 'visible') {
      clearLiveness()
      return
    }
    void refresh()
    if (ws && ws.readyState === WebSocket.OPEN) {
      bumpLiveness()
      return
    }
    retryWs()
  }

  async function init(): Promise<void> {
    loading.value = true
    try {
      await loadRoutes()
    } catch {
      snapshotFailed.value = true
    }
    visibilityHandler = onVisibility
    document.addEventListener('visibilitychange', visibilityHandler)
    staleTimer = setInterval(() => { nowTick.value = Date.now() }, STALE_TICK_MS)
    // 快照與 WS 同時起跑，不等快照回來才連線：等快照會留下一段「已查到資料但還沒
    // 訂閱」的盲窗，行駛中每幾秒就有一筆位置事件會掉在這段裡。
    const snapshot = refresh()
    connectWs()
    await snapshot
  }

  function teardown(): void {
    disposed = true
    closeWebSocketSafely(ws)
    ws = null
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
    clearLiveness()
    stopPolling()
    if (staleTimer) { clearInterval(staleTimer); staleTimer = null }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  return {
    routes, selectedRouteId, trip, stops, loading, snapshotFailed,
    wsConnected, reconnecting, isLive, stale, showMap, tripSummary,
    init, refresh, selectRoute, retryWs, teardown,
  }
}
