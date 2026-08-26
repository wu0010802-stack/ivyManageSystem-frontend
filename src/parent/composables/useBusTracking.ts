/**
 * 家長端娃娃車即時追蹤（module-singleton）。
 *
 * 資料來源有兩條，兩條都必須存在：
 * - HTTP 快照 `GET /api/parent/bus/today`：進頁、重連、回前景、輪詢降級時的權威基準
 * - WS `/api/ws/parent/bus`：行駛中的增量事件（payload 已由後端 services/bus_events
 *   過濾成「只含自家小孩」，前端不再做隱私過濾，也不得把它轉發到別的 channel）
 *
 * 連線骨架逐段比照 `src/composables/usePortalDismissalAlerts.ts`（教師端接送提醒），
 * 沿用它兩次硬化留下的結論：
 * - **socket identity 守衛**（`ws !== socket` 早退）：被替換掉的舊 socket 仍可能吐出
 *   延遲事件，若不擋會誤標斷線、清掉新連線的 liveness timer、多排一次重連。
 * - **過時快照回填守衛**：晚到的 HTTP 快照不得覆蓋期間 WS 已套用的較新狀態。教師端是
 *   id-aware merge（清單型資料）；娃娃車是單一班次的整份狀態，因此改以「欄位群 × 事件
 *   序號」判定：某欄位若在本次 fetch 發出之後被 WS 更新過，這份快照就不覆寫該欄位。
 * - **lifecycleGeneration**：teardown / 重新 init（登出換帳號）後，仍在 flight 的舊快照
 *   一律失效，避免前一位家長的小孩資料回填到新畫面。
 *
 * WS close code 分流（刻意不與教師端「一律指數退避重連」相同）：
 * - 4001/4003 auth：access token 只有 15 分鐘，而後端每 60 秒重驗一次 token，
 *   長時間看車必然會收到 4003。**不可直接導登入頁**——先重抓一次快照，讓
 *   `src/parent/api/index.ts` 的 401 攔截器去跑 refresh（refresh 真的失敗時，攔截器
 *   自己會導 `#/login`，那裡是家長端導登入的單一來源），再重連。
 * - 4007 permission：非家長角色 / 缺 user_id，重連不會變好，且 REST 端同一把鎖，
 *   停手只留提示，不重連也不輪詢。
 * - 1008 rate-limit：連線數超限（開太多分頁），快速重試只會更糟，直接退化為輪詢。
 *
 * 隱私（spec 硬規則）：`stop_lat` / `stop_lng` 是家庭住址。本檔不得把座標寫進 log、
 * 不得送 Sentry、不得放進 URL query——因此全檔沒有任何 console / captureException 呼叫。
 */
import { reactive } from 'vue'
import {
  classifyWebSocketClose,
  closeWebSocketSafely,
  WS_LIVENESS_TIMEOUT_MS,
  WS_RECOVERY_RETRY_MS,
  type WebSocketCloseInfo,
} from '@/utils/ws'
import { parseTaipeiDate } from '@/utils/taipeiTime'
import { getBusToday } from '../api/bus'
import { useConnectionStatus } from './useConnectionStatus'

// 快速重試次數；用盡後改輪詢並低頻嘗試恢復（比照教師端接送提醒）
const WS_MAX_RETRIES = 5
const WS_BACKOFF_BASE_MS = 1000
const WS_BACKOFF_MAX_MS = 30000
// 輪詢降級頻率：與教師端接送提醒一致；娃娃車快照端點很輕，但每位家長都會打
const POLL_INTERVAL_MS = 15000
// 與後端 api/parent_portal/bus.py::STALE_THRESHOLD_SECONDS（60 秒）對齊
const STALE_AFTER_MS = 60000
const STALE_TICK_MS = 10000

interface BusTripBrief {
  id: number
  direction: string
  status: string
  auto_closed: boolean
  started_at: string | null
}
interface BusPosition {
  lat: number
  lng: number
  at: string | null
}
interface BusChild {
  student_id: number
  student_name: string
  stop_status: string
  stops_ahead: number
  stop_lat: number | null
  stop_lng: number | null
  /**
   * 自己這一站的預估到達時刻（naive 台北牆鐘 ISO 字串，`null`＝尚未排定）。
   *
   * ⚠ 後端只回**一個**收斂後的欄位，不是 `eta_live` / `eta_planned` 兩欄
   * （tasks.json 的 FE-PARENT-03 描述是早期版本）。live 優先、退回 planned
   * 的判斷唯一實作在 `services/bus_events.py::build_parent_children_payload`
   * ——那也是家長端隱私過濾的唯一實作點，前端不得自行拼裝或改變優先序。
   *
   * 後端亦未對家長端揭露「這個值是不是 local_fallback 估算的」，故 UI 無從
   * 標示「估算」字樣；要做的話得先在後端 payload 補旗標（會動到隱私守門
   * 測試的欄位白名單），本期不做。
   */
  eta: string | null
}
interface BusSchoolCoords {
  lat: number
  lng: number
}

const state = reactive({
  loading: true,
  trip: null as BusTripBrief | null,
  position: null as BusPosition | null,
  children: [] as BusChild[],
  stale: false,
  school: null as BusSchoolCoords | null,
  wsConnected: false,
  /** 快速重試用盡、目前靠輪詢維生 */
  wsExhausted: false,
  /** 權限被拒（4007）：不再重連，UI 只顯示提示 */
  wsBlocked: false,
  lastWsClose: null as WebSocketCloseInfo | null,
  /**
   * 最近一次快照失敗的時間戳（`Date.now()`）；成功抓到快照或收到 WS 即時座標即歸 null。
   *
   * 為什麼需要它：快照失敗（403 / 500）原本是完全靜默的——畫面會維持最後一筆位置、
   * `loading=false`、沒有任何錯誤訊號，而 `stale` 只在 `status === 'in_progress'` 時
   * 才會亮。對「車在哪」這種安全性功能，把凍結的地圖呈現成即時的並不可接受，UI 必須
   * 據此誠實降級（明確說「無法取得最新位置」而不是靜靜顯示舊座標）。
   * 刻意只放時間戳不放錯誤文字：後端原始訊息不進 state，文案由 UI 決定。
   */
  lastFetchFailedAt: null as number | null,
})

let ws: WebSocket | null = null
let initialized = false
let initPromise: Promise<void> | null = null
let retries = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let recoveryTimer: ReturnType<typeof setTimeout> | null = null
let livenessTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let staleTimer: ReturnType<typeof setInterval> | null = null
let visibilityHandler: (() => void) | null = null
let authRecovering = false

// fetchSnapshot 的發出序號；lifecycleGeneration 跨 teardown 不歸零，確保舊帳號的
// 晚到快照永遠不能回填（教師端 usePortalDismissalAlerts 同一設計）。
let fetchDispatchSeq = 0
let lifecycleGeneration = 0
// 各欄位群最後一次被 WS 事件更新時的 fetchDispatchSeq。快照套用時，若某欄位群的
// eventSeq >= 本次 fetch 的序號，代表「這份快照發出後才收到更新」→ 該欄位不覆寫。
const eventSeq = { trip: 0, position: 0, children: 0 }
// 已由 WS 告知結束的班次 id。`bus_trip_completed` 可能在快照回來之前就到達（此時
// state.trip 還是 null，無從標記狀態），單靠 eventSeq 會讓晚到的快照把已結束的班次
// 復活成 in_progress——那是「車已回校卻還在畫面上跑」的假象。
const completedTripIds = new Set<number>()

// ── 型別 narrow（禁 any；後端 response_model 已存在，待 codegen 產出 bus 路徑後可退場）──
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/**
 * 只保留家長端合約的五個 trip 欄位。
 * WS `bus_trip_started` 送的是管理端形狀的 `trip_out()`（多帶 route_id / last_lat /
 * last_lng / trip_date），整包塞進 state 會讓家長頁不知不覺持有管理端欄位。
 */
function normalizeTrip(raw: unknown): BusTripBrief | null {
  const r = asRecord(raw)
  const id = r ? asNum(r.id) : null
  if (r === null || id === null) return null
  return {
    id,
    direction: asStr(r.direction) ?? '',
    status: asStr(r.status) ?? '',
    auto_closed: r.auto_closed === true,
    started_at: asStr(r.started_at),
  }
}

function normalizePosition(raw: unknown): BusPosition | null {
  const r = asRecord(raw)
  const lat = r ? asNum(r.lat) : null
  const lng = r ? asNum(r.lng) : null
  if (r === null || lat === null || lng === null) return null
  return { lat, lng, at: asStr(r.at) }
}

/** 回傳 null 代表「payload 沒帶名單」，呼叫端應保留既有名單而非清空。 */
function normalizeChildren(raw: unknown): BusChild[] | null {
  if (!Array.isArray(raw)) return null
  return raw.map((item) => {
    const r = asRecord(item) ?? {}
    return {
      student_id: asNum(r.student_id) ?? 0,
      student_name: asStr(r.student_name) ?? '',
      stop_status: asStr(r.stop_status) ?? 'pending',
      stops_ahead: asNum(r.stops_ahead) ?? 0,
      stop_lat: asNum(r.stop_lat),
      stop_lng: asNum(r.stop_lng),
      // eta 歸在 children 欄位群，因此自動吃到既有的「欄位群 × 事件序號」
      // 過時快照守衛——WS `bus_stop_update` 與 HTTP 快照都經過本函式，
      // 晚到的快照不會用舊 ETA 蓋掉 WS 剛推來的新值。
      eta: asStr(r.eta),
    }
  })
}

function normalizeSchool(raw: unknown): BusSchoolCoords | null {
  const r = asRecord(raw)
  const lat = r ? asNum(r.lat) : null
  const lng = r ? asNum(r.lng) : null
  if (lat === null || lng === null) return null
  return { lat, lng }
}

// ── HTTP 快照 ──
function applySnapshot(raw: unknown, mySeq: number): void {
  const data = asRecord(raw)
  if (!data) return
  if (mySeq > eventSeq.trip) state.trip = normalizeTrip(data.trip)
  if (mySeq > eventSeq.position) {
    state.position = normalizePosition(data.position)
    state.stale = data.stale === true
  }
  if (mySeq > eventSeq.children) state.children = normalizeChildren(data.children) ?? []
  // school 是園所設定的靜態座標，沒有任何 WS 事件會改動它
  state.school = normalizeSchool(data.school)
  // 已收過結束事件的班次一律覆寫回 completed，不論這份快照多舊。必須排在 position
  // 之後：已回校的車不該還帶著座標在地圖上跑。
  if (state.trip && completedTripIds.has(state.trip.id) && state.trip.status !== 'completed') {
    state.trip = { ...state.trip, status: 'completed' }
    state.position = null
    state.stale = false
  }
}

async function fetchSnapshot(): Promise<void> {
  const mySeq = ++fetchDispatchSeq
  const myGeneration = lifecycleGeneration
  try {
    const res = await getBusToday()
    // 已有更新的 fetch 發出（out-of-order）或已 teardown / 換帳號 → 丟棄這份快照
    if (myGeneration !== lifecycleGeneration || mySeq !== fetchDispatchSeq) return
    applySnapshot(res?.data, mySeq)
    state.lastFetchFailedAt = null
  } catch {
    // 不得靜默：403 / 500 之下畫面會維持最後一筆位置且毫無訊號。這裡只記時間戳，
    // 錯誤內容一律不進 state（避免後端訊息外洩到畫面）。teardown / out-of-order 的
    // 舊 fetch 一樣不得回填——與成功路徑同一組守衛。
    if (myGeneration === lifecycleGeneration && mySeq === fetchDispatchSeq) {
      state.lastFetchFailedAt = Date.now()
    }
  } finally {
    if (myGeneration === lifecycleGeneration && mySeq === fetchDispatchSeq) state.loading = false
  }
}

// ── stale 重算 ──
/**
 * 只有「進行中且已有座標」才需要用時間差判定；班次結束一律歸 false，否則畫面會卡在
 * 「位置已過時」的死狀態。naive 時間字串必須用 parseTaipeiDate 錨定 +08:00——直接
 * `new Date(naive)` 會以裝置時區解析，非台北時區的裝置整個位移 8 小時。
 */
function recomputeStale(): void {
  if (state.trip?.status !== 'in_progress') {
    state.stale = false
    return
  }
  const at = parseTaipeiDate(state.position?.at)
  if (!at) return
  state.stale = Date.now() - at.getTime() > STALE_AFTER_MS
}

// ── WS 事件 ──
function handleEvent(event: Record<string, unknown>): void {
  const type = asStr(event.type)
  const payload = asRecord(event.payload) ?? {}
  if (type === 'bus_position') {
    const position = normalizePosition(payload)
    if (!position) return
    state.position = position
    // 剛收到 server 推播的即時座標，定義上就是新鮮的
    state.stale = false
    // 拿得到即時座標就代表資料管線是通的，先前的快照失敗不該再讓畫面降級
    state.lastFetchFailedAt = null
    eventSeq.position = fetchDispatchSeq
  } else if (type === 'bus_stop_update') {
    const children = normalizeChildren(payload.children)
    if (!children) return
    state.children = children
    eventSeq.children = fetchDispatchSeq
  } else if (type === 'bus_trip_started') {
    const trip = normalizeTrip(payload.trip)
    if (!trip) return
    state.trip = trip
    completedTripIds.delete(trip.id)
    state.children = normalizeChildren(payload.children) ?? []
    // 新班次尚未回報座標
    state.position = null
    state.stale = false
    eventSeq.trip = fetchDispatchSeq
    eventSeq.children = fetchDispatchSeq
    eventSeq.position = fetchDispatchSeq
  } else if (type === 'bus_trip_completed') {
    // 手足可能分屬不同路線（後端合約已載明 today 只回其中一筆）；別班次的結束事件
    // 不得把目前顯示的班次清掉。
    const tripId = asNum(payload.trip_id)
    if (state.trip && tripId !== null && tripId !== state.trip.id) return
    if (tripId !== null) completedTripIds.add(tripId)
    // 首次快照還沒回來時 state.trip 是 null，無從判斷這是不是「自己這一班」——
    // 若照樣清 position 並 bump 序號，別條路線（手足）先到站就會把本班次行駛中的
    // 座標一起吃掉。此時只記下 trip id，等快照回來再由 applySnapshot 比對決定。
    if (!state.trip) return
    state.trip = { ...state.trip, status: 'completed' }
    state.position = null
    state.stale = false
    // 刻意不 bump eventSeq.trip：仍讓快照補齊 trip 的其他欄位，狀態由
    // completedTripIds 在 applySnapshot 內覆寫回 completed。
    eventSeq.position = fetchDispatchSeq
  }
}

// ── liveness / 輪詢 / 重連 ──
function clearLiveness(): void {
  if (livenessTimer) {
    clearTimeout(livenessTimer)
    livenessTimer = null
  }
}

/** 每收到任何訊息（含後端 ping）就續命；逾時代表半開死亡，主動踢掉重連。 */
function bumpLiveness(): void {
  clearLiveness()
  // iOS 背景會凍結 setTimeout，隱藏時不排 liveness，改由 visibilitychange 補
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  livenessTimer = setTimeout(() => {
    if (!ws) return
    closeWebSocketSafely(ws)
    ws = null
    state.wsConnected = false
    state.lastWsClose = classifyWebSocketClose({ code: 1006, reason: '' })
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
  pollTimer = setInterval(() => { void fetchSnapshot() }, POLL_INTERVAL_MS)
}

/** 退化為輪詢 + 低頻嘗試恢復 WS（1008 與快速重試耗盡共用）。 */
function degradeToPolling(): void {
  state.wsExhausted = true
  startPolling()
  if (!recoveryTimer) {
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null
      connectWs()
    }, WS_RECOVERY_RETRY_MS)
  }
}

function scheduleReconnect(): void {
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
 * 4001/4003：先重抓快照借道 axios 401 攔截器跑 refresh（refresh 失敗時攔截器自己會
 * 導 `#/login`），成功則重連。retries 不歸零，因此持續失敗仍會在額度用盡後退化為輪詢，
 * 不會變成無窮 refresh 迴圈。
 */
async function recoverAuthAndReconnect(): Promise<void> {
  if (authRecovering) return
  authRecovering = true
  const myGeneration = lifecycleGeneration
  try {
    await fetchSnapshot()
  } finally {
    authRecovering = false
  }
  if (myGeneration !== lifecycleGeneration) return
  scheduleReconnect()
}

function handleClose(info: WebSocketCloseInfo): void {
  state.wsConnected = false
  state.lastWsClose = info
  clearLiveness()
  if (info.kind === 'permission') {
    // REST 端同一把鎖，輪詢也不會成功；停手只留提示
    state.wsBlocked = true
    stopPolling()
    return
  }
  if (info.kind === 'auth') {
    void recoverAuthAndReconnect()
    return
  }
  if (info.kind === 'rate-limit') {
    degradeToPolling()
    return
  }
  scheduleReconnect()
}

function connectWs(): void {
  if (state.wsBlocked) return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  // token 由 httpOnly cookie 自動攜帶，**不得**放進 URL query
  const socket = new WebSocket(`${proto}://${location.host}/api/ws/parent/bus`)
  ws = socket
  useConnectionStatus().registerWs(socket)

  // 以 socket instance identity 守衛所有 handler：被替換掉的舊 socket 若延遲吐出事件，
  // 一律忽略，避免污染新連線狀態。
  socket.onopen = () => {
    if (ws !== socket) return
    state.wsConnected = true
    state.wsExhausted = false
    state.lastWsClose = null
    retries = 0
    stopPolling()
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
    bumpLiveness()
    // 補回「快照發出到 subscribe 成功」之間漏掉的事件
    void fetchSnapshot()
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
    state.wsConnected = false
  }
  socket.onclose = (event) => {
    if (ws !== socket) return
    ws = null
    handleClose(classifyWebSocketClose(event))
  }
}

/** 立刻換一條連線（回前景 / UI 手動重試）。 */
function retryWs(): void {
  if (state.wsBlocked) return
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
  closeWebSocketSafely(ws)
  ws = null
  retries = 0
  state.wsExhausted = false
  connectWs()
}

function onVisibility(): void {
  if (document.visibilityState !== 'visible') {
    clearLiveness()
    return
  }
  void fetchSnapshot()
  if (ws && ws.readyState === WebSocket.OPEN) {
    bumpLiveness()
    return
  }
  retryWs()
}

async function init(): Promise<void> {
  if (initialized) {
    // 併發呼叫共用同一次初始化，避免第二個呼叫者拿到還在 loading 的狀態就往下走
    if (initPromise) await initPromise
    return
  }
  initialized = true
  lifecycleGeneration++
  state.loading = true
  visibilityHandler = onVisibility
  document.addEventListener('visibilitychange', visibilityHandler)
  staleTimer = setInterval(recomputeStale, STALE_TICK_MS)
  // 快照先發出（序號 1），WS 立刻接著建立而**不等快照回來**：等快照才連線會留下一段
  // 「已查到資料但還沒訂閱」的盲窗，行駛中每十餘秒就有一筆位置事件會掉在這段裡。
  // 代價是快照 in-flight 期間就可能收到 WS 事件——由 eventSeq 守衛負責不讓晚到的
  // 快照回填覆蓋它。
  initPromise = fetchSnapshot()
  connectWs()
  await initPromise
}

function teardown(): void {
  // 先切斷資料生命週期，讓仍在 flight 的舊快照失效
  lifecycleGeneration++
  initialized = false
  initPromise = null
  authRecovering = false
  // closeWebSocketSafely 只卸 on* 屬性，卸不掉 registerWs 用 addEventListener 掛的
  // handler；teardown 後沒有新 socket 會接管，必須顯式交還全域連線狀態的所有權。
  useConnectionStatus().unregisterWs(ws)
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
  retries = 0
  eventSeq.trip = 0
  eventSeq.position = 0
  eventSeq.children = 0
  completedTripIds.clear()
  // 換帳號後不得殘留前一位家長的小孩資料
  state.loading = true
  state.trip = null
  state.position = null
  state.children = []
  state.stale = false
  state.school = null
  state.wsConnected = false
  state.wsExhausted = false
  state.wsBlocked = false
  state.lastWsClose = null
  state.lastFetchFailedAt = null
}

export function useBusTracking() {
  return { state, init, teardown, refresh: fetchSnapshot, retryWs }
}

export function __resetForTest(): void {
  teardown()
  fetchDispatchSeq = 0
}
