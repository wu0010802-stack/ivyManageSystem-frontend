import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

vi.mock('@/api/bus', () => ({
  startBusTrip: vi.fn(),
  getActiveBusTrip: vi.fn(),
  postBusPings: vi.fn(),
  postBusPingsKeepalive: vi.fn(() => true),
  departBusStop: vi.fn(),
  skipBusStop: vi.fn(),
  undoBusStop: vi.fn(),
  completeBusTrip: vi.fn(),
  listPortalBusRoutes: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import { ElMessage, ElMessageBox } from 'element-plus'
import {
  startBusTrip, getActiveBusTrip, postBusPings, postBusPingsKeepalive, departBusStop,
  skipBusStop, undoBusStop, completeBusTrip, listPortalBusRoutes,
} from '@/api/bus'
import {
  usePortalBusTrip, PING_FLUSH_INTERVAL_MS, SUSPECT_TIMESTAMP_STREAK,
  ACTIVE_TRIP_RESYNC_INTERVAL_MS, DEPART_UNDO_WINDOW_MS,
} from '@/composables/usePortalBusTrip'

// ---------------------------------------------------------------------------
// 測試時間軸：本機時鐘固定在 2026-07-29 09:00:00 UTC；伺服器 Date header 預設同步。
// helper 自身驗證見最下方「測試輔助函式自檢」——上一支任務因 helper 截毫秒
// 讓「差 1ms」的測資實際是「差 0ms」，斷言形同虛設。
// ---------------------------------------------------------------------------
const LOCAL_NOW_MS = Date.UTC(2026, 6, 29, 9, 0, 0)
const SERVER_DATE_HEADER = 'Wed, 29 Jul 2026 09:00:00 GMT'
const ONE_HOUR_MS = 60 * 60 * 1000

function resp(data: unknown, dateHeader: string = SERVER_DATE_HEADER) {
  return { data, headers: { date: dateHeader } }
}

/**
 * 伺服器時鐘與（假的）本機時鐘同步時的回應。**header 必須在呼叫當下才算**——
 * 用固定字串會讓時間推進後的每次回應都把偏差算成負值，靜默污染後續所有 `at`。
 *
 * ⚠ `toUTCString()` **只有秒級解析度**（HTTP `Date` header 本來就是），毫秒會被截掉。
 * 因此**本檔的測試時間一律要落在整秒**，否則算出來的偏差會多出最多 999ms。
 * 這個截斷是 fail-loud（明文 ISO 字串斷言會直接變紅），不像 `wallClock()` 那種靜默通過，
 * 但仍由下方「helper 自檢」的毫秒級斷言明文咬住。
 */
function respNow(data: unknown) {
  return { data, headers: { date: new Date(Date.now()).toUTCString() } }
}

function tripPayload(overrides: Record<string, unknown> = {}) {
  return {
    trip: { id: 7, route_id: 3, direction: 'morning', status: 'in_progress', ...overrides },
    stops: [
      { stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'pending', lat: 22.6, lng: 120.3 },
      { stop_id: 12, student_id: 102, student_name: '小華', seq: 2, status: 'pending', lat: 22.7, lng: 120.4 },
    ],
  }
}

/**
 * 開班選單（BE-API-PORTAL-01 後是**班次列表**：單方向、含出發時間與當日四態）。
 * `sort_order` 刻意亂序給，用來咬住前端那道防禦性排序。
 */
function routesPayload() {
  return {
    routes: [
      {
        id: 3, name: 'A 線', is_active: true, direction: 'morning',
        depart_time: '07:30', sort_order: 1, today_status: 'none', today_trip_id: null,
      },
      // 端點理應只回啟用中的班次；保留一筆停用的用來咬住前端那道防禦性過濾
      { id: 4, name: 'B 線（停用）', is_active: false, direction: 'morning',
        depart_time: '07:40', sort_order: 2, today_status: 'none', today_trip_id: null },
    ],
  }
}

/** 造一筆班次列表項目（只覆寫要測的欄位）。 */
function routeItem(over: Record<string, unknown> = {}) {
  return {
    id: 3, name: 'A 線', is_active: true, direction: 'morning',
    depart_time: '07:30', sort_order: 1, today_status: 'none', today_trip_id: null,
    ...over,
  }
}

/** 造一個 axios 風格的錯誤；`status` 為 undefined 代表網路層失敗（無 response）。 */
function axiosError(status?: number, detail: unknown = '錯誤') {
  return status === undefined
    ? Object.assign(new Error('Network Error'), { response: undefined })
    : Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { detail } } })
}

/** 每個測試建立的 composable 實例；afterEach 一律 teardown，避免 document 監聽器跨測試累積。 */
const liveBuses: Array<ReturnType<typeof usePortalBusTrip>> = []
function createBus() {
  const bus = usePortalBusTrip()
  liveBuses.push(bus)
  return bus
}

let watchCb: ((pos: unknown) => void) | null = null
let watchErrCb: ((err: unknown) => void) | null = null
const geolocation = {
  watchPosition: vi.fn((cb: (pos: unknown) => void, err: (e: unknown) => void) => {
    watchCb = cb
    watchErrCb = err
    return 42
  }),
  clearWatch: vi.fn(),
}
const wakeLockSentinel = { release: vi.fn().mockResolvedValue(undefined) }
const wakeLock = { request: vi.fn().mockResolvedValue(wakeLockSentinel) }

/**
 * 模擬「裝置完全不支援定位」（`!('geolocation' in navigator)`）。**不能用
 * `Object.defineProperty(navigator, 'geolocation', { value: undefined })` 再 `delete`**
 * ——測試環境的 `Navigator.prototype` 本身就有 `geolocation`（未實作但存在），刪掉
 * own property 後 `in` 操作仍會沿原型鏈找到它、恆為 `true`。改用 Proxy 攔截 `has`。
 */
let originalNavigator: Navigator
function stubNoGeolocation(): void {
  originalNavigator = globalThis.navigator
  const proxy = new Proxy(originalNavigator, {
    has: (target, prop) => (prop === 'geolocation' ? false : prop in target),
    get: (target, prop, receiver) => (
      prop === 'geolocation' ? undefined : Reflect.get(target, prop, receiver)
    ),
  })
  Object.defineProperty(globalThis, 'navigator', { value: proxy, configurable: true })
}
function restoreGeolocation(): void {
  Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true })
}

function emitPosition(atMs: number, coords: Record<string, number> = {}) {
  watchCb?.({ timestamp: atMs, coords: { latitude: 22.61, longitude: 120.31, accuracy: 12, ...coords } })
}

/** 推進到下一次批次送出並讓 promise 鏈跑完。 */
async function advanceToFlush(times = 1) {
  for (let i = 0; i < times; i += 1) {
    await vi.advanceTimersByTimeAsync(PING_FLUSH_INTERVAL_MS)
    await flushPromises()
  }
}

/**
 * 推進「離站」的可取消緩衝期，讓它真的送出。
 * `departStop()` 自 DEPART_UNDO_WINDOW_MS 起只是**排程**，不再立即打 API。
 */
async function settleDepart() {
  await vi.advanceTimersByTimeAsync(DEPART_UNDO_WINDOW_MS)
  await flushPromises()
}

/** 送出的所有點（依批次順序攤平）。 */
function sentPoints() {
  return vi.mocked(postBusPings).mock.calls.flatMap(
    ([, points]) => points as Array<{ at: string }>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  watchCb = null
  watchErrCb = null
  vi.useFakeTimers()
  vi.setSystemTime(LOCAL_NOW_MS)
  Object.defineProperty(globalThis.navigator, 'geolocation', { value: geolocation, configurable: true })
  Object.defineProperty(globalThis.navigator, 'wakeLock', { value: wakeLock, configurable: true })
  vi.mocked(postBusPings).mockImplementation((() => Promise.resolve(respNow(null))) as never)
  vi.mocked(listPortalBusRoutes).mockResolvedValue(resp(routesPayload()) as never)
  vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null }) as never)
  vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
})

afterEach(() => {
  liveBuses.forEach((b) => b.teardown())
  liveBuses.length = 0
  vi.useRealTimers()
})

/** 進頁即有進行中班次的常見起點。 */
async function bootWithActiveTrip(dateHeader = SERVER_DATE_HEADER) {
  vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload(), dateHeader) as never)
  const bus = createBus()
  await bus.init()
  await flushPromises()
  return bus
}

describe('usePortalBusTrip — 進頁載入', () => {
  it('有進行中班次時套用班次與站點，並開始 GPS 追蹤', async () => {
    const bus = await bootWithActiveTrip()

    expect(bus.trip.value?.id).toBe(7)
    expect(bus.stops.value.map((s) => s.stop_id)).toEqual([11, 12])
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
    expect(bus.snapshotFailed.value).toBe(false)
  })

  it('沒有進行中班次時停在開班畫面', async () => {
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.trip.value).toBeNull()
    expect(listPortalBusRoutes).toHaveBeenCalledTimes(1)
    expect(geolocation.watchPosition).not.toHaveBeenCalled()
    // 本來就沒有班次 ≠ 班次剛結束，不得跳出「班次已結束」的警告
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('進頁只打一次「我的班次」查詢（mine=true），不逐路線試探、不做全域查詢', async () => {
    // 逐路線試探取的是「id 最小、且有 in_progress 班次的那條」＝ **別人的班次**：
    // B 線司機會接手 A 線的完整名冊，並把 B 車的 GPS 寫進 A 車的班次。
    // 後端 8836ecde 補上 operator 維度後，改由 `mine=true` 一次問「我的」。
    vi.mocked(listPortalBusRoutes).mockResolvedValue(resp({
      routes: [
        { id: 3, name: 'A 線', is_active: true },
        { id: 5, name: 'C 線', is_active: true },
      ],
    }) as never)
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload({ route_id: 5 })) as never)

    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(vi.mocked(getActiveBusTrip).mock.calls).toEqual([[null, null, true]])
    expect(bus.trip.value?.route_id).toBe(5)
  })

  it('自己沒有進行中班次時停在開班畫面（不得再往下撈別人的那一班）', async () => {
    vi.mocked(listPortalBusRoutes).mockResolvedValue(resp({
      routes: [
        { id: 3, name: 'A 線', is_active: true },
        { id: 5, name: 'C 線', is_active: true },
      ],
    }) as never)
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null, stops: null }) as never)

    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(vi.mocked(getActiveBusTrip).mock.calls).toEqual([[null, null, true]])
    expect(bus.trip.value).toBeNull()
    expect(bus.snapshotFailed.value).toBe(false)
  })

  it('mine=true 遭 403（帳號未綁員工）：明講且可行動，不得靜默也不得退化成開班畫面', async () => {
    // 後端刻意回 403 而不是「退化成回任何人的班次」。前端同樣不能吞掉：
    // 這條路徑重試不會變好（要有人去後台綁定員工），而開班同樣會 403。
    vi.mocked(getActiveBusTrip).mockRejectedValue(
      axiosError(403, '此帳號無關聯員工資料，請先綁定員工身份'),
    )
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.employeeUnlinked.value).toBe(true)
    expect(bus.snapshotFailed.value).toBe(true)
    expect(bus.trip.value).toBeNull()
    expect(bus.loading.value).toBe(false)
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('未綁定的旗標在下一次重新載入成功後要清掉（否則錯誤卡永遠黏著）', async () => {
    vi.mocked(getActiveBusTrip).mockRejectedValue(axiosError(403))
    const bus = createBus()
    await bus.init()
    await flushPromises()
    expect(bus.employeeUnlinked.value).toBe(true)

    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload()) as never)
    await bus.init()
    await flushPromises()

    expect(bus.employeeUnlinked.value).toBe(false)
    expect(bus.snapshotFailed.value).toBe(false)
    expect(bus.trip.value?.id).toBe(7)
  })

  it('非 403 的班次查詢失敗不得誤報成「帳號未綁員工」', async () => {
    vi.mocked(getActiveBusTrip).mockRejectedValue(axiosError(500))
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.employeeUnlinked.value).toBe(false)
    expect(bus.snapshotFailed.value).toBe(true)
  })

  it('班次查詢失敗時不得謊稱沒有班次：標記 snapshotFailed', async () => {
    vi.mocked(getActiveBusTrip).mockRejectedValue(axiosError(500))
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.snapshotFailed.value).toBe(true)
    expect(bus.trip.value).toBeNull()
    expect(ElMessage.error).toHaveBeenCalled()
    expect(bus.loading.value).toBe(false)
  })

  it('路線清單失敗不得連帶讓行駛中的班次查不到（兩支請求各自獨立）', async () => {
    // 🔴 營運可感知的失效：司機行駛中重載頁面、`/routes` 剛好 5xx，
    // 若兩支串行就會查不到班次 → GPS 不啟動 → 家長端完全看不到車。
    // 路線清單只是「開班選單」，它掛掉只該擋住「開新班次」這一件事。
    vi.mocked(listPortalBusRoutes).mockRejectedValue(axiosError(500))
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload()) as never)
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(getActiveBusTrip).toHaveBeenCalledTimes(1)
    expect(bus.trip.value?.id).toBe(7)
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
    expect(bus.routesFailed.value).toBe(true)
    // 班次查得到就不是「班次狀態不明」，不得亮成快照失敗
    expect(bus.snapshotFailed.value).toBe(false)
    expect(bus.employeeUnlinked.value).toBe(false)
  })

  it('路線清單失敗且自己沒有班次時亮 routesFailed，不得畫成「尚未設定路線」', async () => {
    vi.mocked(listPortalBusRoutes).mockRejectedValue(axiosError(500))
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.routesFailed.value).toBe(true)
    expect(bus.routes.value).toEqual([])
    expect(ElMessage.error).toHaveBeenCalled()
    expect(bus.loading.value).toBe(false)
  })

  it('缺 BUS_TRIPS_OPERATE：兩支都 403，不得誤報成「帳號未綁員工」', async () => {
    // 後端兩支端點掛同一個 `_operate_dep`，缺權限時**兩支都會 403**。
    // 判別必須看「兩支請求的結果組合」，不能只看 active 那支——也不能靠執行順序
    // （並行化之後就沒有「routes 先炸所以沒跑到」這層意外保護了）。
    vi.mocked(listPortalBusRoutes).mockRejectedValue(axiosError(403))
    vi.mocked(getActiveBusTrip).mockRejectedValue(axiosError(403))
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.employeeUnlinked.value).toBe(false)
    expect(bus.routesFailed.value).toBe(true)
    expect(bus.snapshotFailed.value).toBe(true)
  })

  it('未綁員工：路線清單拿得到（權限沒問題）但查我的班次 403 才算', async () => {
    vi.mocked(getActiveBusTrip).mockRejectedValue(axiosError(403))
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.employeeUnlinked.value).toBe(true)
    expect(bus.routesFailed.value).toBe(false)
  })

  it('班次列表保留四態欄位、濾掉停用班次，且不含任何學生名冊', async () => {
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.routes.value).toEqual([{
      id: 3, name: 'A 線', direction: 'morning', depart_time: '07:30',
      sort_order: 1, today_status: 'none', today_trip_id: null,
    }])
    // 開班選單的授權面（BUS_TRIPS_OPERATE）比 BUS_READ 寬，端點刻意不回 stops；
    // 前端狀態也不得出現任何名冊痕跡。
    expect(JSON.stringify(bus.routes.value)).not.toContain('is_active')
    expect(JSON.stringify(bus.routes.value)).not.toContain('stops')
  })

  it('班次依 sort_order 排序（司機找班次的唯一線索，不押在後端回傳順序）', async () => {
    vi.mocked(listPortalBusRoutes).mockResolvedValue(resp({
      routes: [
        routeItem({ id: 9, name: 'C 線', sort_order: 3 }),
        routeItem({ id: 5, name: 'B 線', sort_order: 2 }),
        routeItem({ id: 3, name: 'A 線', sort_order: 1 }),
      ],
    }) as never)
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.routes.value.map((r) => r.name)).toEqual(['A 線', 'B 線', 'C 線'])
  })

  it('當日四態原樣帶進狀態；未知值一律保守當 none（可開班，讓後端擋）', async () => {
    vi.mocked(listPortalBusRoutes).mockResolvedValue(resp({
      routes: [
        routeItem({ id: 3, sort_order: 1, today_status: 'planned', today_trip_id: 71 }),
        routeItem({ id: 5, sort_order: 2, today_status: 'in_progress', today_trip_id: 72 }),
        routeItem({ id: 7, sort_order: 3, today_status: 'completed', today_trip_id: 73 }),
        routeItem({ id: 9, sort_order: 4, today_status: 'wat', today_trip_id: null }),
      ],
    }) as never)
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.routes.value.map((r) => r.today_status))
      .toEqual(['planned', 'in_progress', 'completed', 'none'])
    expect(bus.routes.value[0].today_trip_id).toBe(71)
  })

  it('只有一條啟用路線時自動選取', async () => {
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.selectedRouteId.value).toBe(3)
  })

  it('多條啟用路線時不自動選取（避免開錯路線）', async () => {
    vi.mocked(listPortalBusRoutes).mockResolvedValue(resp({
      routes: [
        { id: 3, name: 'A 線', is_active: true },
        { id: 5, name: 'C 線', is_active: true },
      ],
    }) as never)
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.selectedRouteId.value).toBeNull()
    expect(bus.routes.value).toHaveLength(2)
  })

  it('用的是 portal 路線端點（不是回全車名冊的 admin 端點）', async () => {
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(listPortalBusRoutes).toHaveBeenCalledTimes(1)
    expect(bus.routes.value.map((r) => r.id)).toEqual([3])
  })
})

describe('usePortalBusTrip — 開始班次', () => {
  async function bootForStart() {
    const bus = createBus()
    await bus.init()
    await flushPromises()
    return bus
  }

  it('成功開班後套用班次並開始追蹤；start 不再帶 direction（方向由班次衍生）', async () => {
    vi.mocked(startBusTrip).mockResolvedValue(resp(tripPayload()) as never)
    const bus = await bootForStart()
    await bus.start()
    await flushPromises()

    // 契約破壞（spec「第一期契約破壞清單—POST /portal/bus/trips」）：
    // TripStartIn.direction 已移除，多傳一個參數就是回到舊契約。
    expect(startBusTrip).toHaveBeenCalledWith(3)
    expect(bus.trip.value?.id).toBe(7)
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
  })

  it('未選路線時不打 API', async () => {
    vi.mocked(listPortalBusRoutes).mockResolvedValue(resp({ routes: [] }) as never)
    const bus = await bootForStart()
    await bus.start()

    expect(startBusTrip).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('409 已有進行中班次：接手時以 route_id 單維度限縮（不得撈到別條班次的名冊）', async () => {
    vi.mocked(startBusTrip).mockRejectedValue(
      axiosError(409, { message: '已有進行中的班次', trip_id: 7 }),
    )
    const bus = await bootForStart() // 進頁時沒有班次，才會走到「選路線 → 開班」
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload()) as never)
    await bus.start()
    await flushPromises()

    // 接手／重新同步一律 `mine=false`：後端刻意允許任一持 BUS_TRIPS_OPERATE 的帳號
    // 接手別人開的班次（司機中途換手），帶 mine 會把換手情境擋成「查無班次」。
    // direction 一律 null：班次已是單方向，route_id 本身就決定了方向。
    expect(getActiveBusTrip).toHaveBeenLastCalledWith(3, null, false)
    expect(bus.trip.value?.id).toBe(7)
    expect(ElMessage.warning).toHaveBeenCalled()
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
  })

  it('其他錯誤顯示後端訊息且不開始追蹤', async () => {
    vi.mocked(startBusTrip).mockRejectedValue(axiosError(500, '伺服器忙碌中'))
    const bus = await bootForStart()
    await bus.start()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('伺服器忙碌中')
    expect(bus.trip.value).toBeNull()
    expect(geolocation.watchPosition).not.toHaveBeenCalled()
  })

  it('422 缺座標：訊息留在畫面上（不是 toast）並補上人數，不外洩 student_id', async () => {
    // 司機在車上手邊在忙，一閃即逝的 toast 看不到就再也回不來；而這種錯誤要人去
    // 後台補資料才會好。student_ids 是內部識別碼，司機看不懂，只給「共 N 位」。
    vi.mocked(startBusTrip).mockRejectedValue(axiosError(422, {
      message: '部分學生缺少接送座標，請先於班次編輯補設接送地址',
      student_ids: [101, 102, 103],
    }))
    const bus = await bootForStart()
    await bus.start()
    await flushPromises()

    expect(bus.startBlockedMessage.value)
      .toBe('部分學生缺少接送座標，請先於班次編輯補設接送地址（共 3 位）')
    expect(bus.startBlockedMessage.value).not.toContain('101')
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(bus.trip.value).toBeNull()
  })

  it('422 超過座位上限：後端字串訊息原樣留在畫面上', async () => {
    vi.mocked(startBusTrip).mockRejectedValue(
      axiosError(422, '座位上限為 20，目前已有 22 位學生'),
    )
    const bus = await bootForStart()
    await bus.start()
    await flushPromises()

    expect(bus.startBlockedMessage.value).toBe('座位上限為 20，目前已有 22 位學生')
  })

  it('下一次開班先清掉上一輪的阻擋訊息', async () => {
    vi.mocked(startBusTrip).mockRejectedValue(axiosError(422, '座位上限為 20，目前已有 22 位學生'))
    const bus = await bootForStart()
    await bus.start()
    await flushPromises()
    expect(bus.startBlockedMessage.value).not.toBeNull()

    vi.mocked(startBusTrip).mockResolvedValue(resp(tripPayload()) as never)
    await bus.start()
    await flushPromises()
    expect(bus.startBlockedMessage.value).toBeNull()
  })

  it('409 但接手落空（bus_count 達上限）不得靜默停在開班畫面', async () => {
    // 這種 409 的 trip 不是自己的，接手查不到；若不留訊息，畫面看起來像什麼都沒發生。
    vi.mocked(startBusTrip).mockRejectedValue(
      axiosError(409, '目前已有 2 輛車在路上，達本校可用車輛數上限（2）'),
    )
    const bus = await bootForStart()
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null, stops: null }) as never)
    await bus.start()
    await flushPromises()

    expect(bus.trip.value).toBeNull()
    expect(bus.startBlockedMessage.value)
      .toBe('目前已有 2 輛車在路上，達本校可用車輛數上限（2）')
  })

  it('starting 旗標在成功與失敗後都會歸位', async () => {
    vi.mocked(startBusTrip).mockRejectedValue(axiosError(500))
    const bus = await bootForStart()
    const pending = bus.start()
    expect(bus.starting.value).toBe(true)
    await pending
    expect(bus.starting.value).toBe(false)
  })
})

describe('usePortalBusTrip — 班次摘要（路線與方向必須看得見）', () => {
  it('顯示路線名稱與方向的中文標籤', async () => {
    const bus = await bootWithActiveTrip()
    expect(bus.tripSummary.value).toBe('A 線・早上接學生')
  })

  it('下午班次用對應標籤', async () => {
    vi.mocked(getActiveBusTrip).mockResolvedValue(
      resp(tripPayload({ direction: 'afternoon' })) as never,
    )
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.tripSummary.value).toBe('A 線・下午送學生')
  })

  it('接手到不在自己選單裡的路線時，仍以 trip.route_id 呈現（不得用選單值蓋掉）', async () => {
    // 選單只有 3 號路線，但接手到的是 9 號——正是要讓司機察覺的情境
    vi.mocked(getActiveBusTrip).mockResolvedValue(
      resp(tripPayload({ route_id: 9 })) as never,
    )
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.selectedRouteId.value).toBe(3)
    expect(bus.tripSummary.value).toBe('路線 #9・早上接學生')
  })

  it('沒有班次時為空字串', async () => {
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.tripSummary.value).toBe('')
  })
})

describe('usePortalBusTrip — GPS 上報', () => {
  it('每 5 秒批次送出，未到不送', async () => {
    const bus = await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)

    await vi.advanceTimersByTimeAsync(PING_FLUSH_INTERVAL_MS - 1)
    await flushPromises()
    expect(postBusPings).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(postBusPings).toHaveBeenCalledWith(7, [
      { lat: 22.61, lng: 120.31, accuracy: 12, at: '2026-07-29T09:00:00.000Z' },
    ])
    expect(bus.gpsActive.value).toBe(true)
  })

  it('單顆時間戳暴衝的點被擋下，其後的正常點照樣送出（nowAt 每次都有傳）', async () => {
    await bootWithActiveTrip()
    // 裝置吐出一顆 3000 年的 timestamp：若 push 漏傳 nowAt，它會進緩衝並成為
    // 後續所有點的節流基準（其後每個真實點都算「時鐘回捲」而全數放行）。
    emitPosition(Date.UTC(3000, 0, 1))
    emitPosition(LOCAL_NOW_MS + 1000)
    emitPosition(LOCAL_NOW_MS + 2000)
    await advanceToFlush()

    expect(sentPoints().map((p) => p.at)).toEqual([
      '2026-07-29T09:00:01.000Z',
      '2026-07-29T09:00:02.000Z',
    ])
  })

  it('裝置時鐘系統性偏差以伺服器 Date header 校正：at 與 nowAt 同步位移，點不被誤殺', async () => {
    // 伺服器比本機快一小時 → 所有點的 at 應被推進一小時後送出
    await bootWithActiveTrip('Wed, 29 Jul 2026 10:00:00 GMT')
    emitPosition(LOCAL_NOW_MS)
    emitPosition(LOCAL_NOW_MS + 1000)
    await advanceToFlush()

    expect(sentPoints().map((p) => p.at)).toEqual([
      new Date(LOCAL_NOW_MS + ONE_HOUR_MS).toISOString(),
      new Date(LOCAL_NOW_MS + ONE_HOUR_MS + 1000).toISOString(),
    ])
  })

  it('取不到 Date header 時退回本機時鐘（不把偏差當 0 覆蓋，也不整批停擺）', async () => {
    await bootWithActiveTrip()
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload(), '') as never)
    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()

    expect(sentPoints().map((p) => p.at)).toEqual(['2026-07-29T09:00:00.000Z'])
  })

  it('timestamp 非有限數時退回「校正後的現在」，不讓該點被丟掉', async () => {
    await bootWithActiveTrip()
    emitPosition(Number.NaN)
    await advanceToFlush()

    expect(sentPoints().map((p) => p.at)).toEqual(['2026-07-29T09:00:00.000Z'])
  })

  it('分頁回前景時重新取得 Wake Lock（瀏覽器在隱藏期間會自行釋放）', async () => {
    await bootWithActiveTrip()
    expect(wakeLock.request).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(wakeLock.request).toHaveBeenCalledTimes(2)
  })

  it('分頁轉為隱藏時把已收集的點送出（關分頁／被系統回收不會觸發 unmount）', async () => {
    await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    }

    expect(sentPoints().map((p) => p.at)).toEqual(['2026-07-29T09:00:00.000Z'])
  })

  it('頁面即將消失（pagehide）時用 keepalive 送出待送的點', async () => {
    await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)

    window.dispatchEvent(new Event('pagehide'))
    await flushPromises()

    expect(postBusPingsKeepalive).toHaveBeenCalledTimes(1)
    const [tripId, points] = vi.mocked(postBusPingsKeepalive).mock.calls[0]
    expect(tripId).toBe(7)
    expect((points as Array<{ at: string }>).map((p) => p.at)).toEqual(['2026-07-29T09:00:00.000Z'])
  })

  it('pagehide 送出後 outbox 已清空，回前景不會把同一批再送一次', async () => {
    await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)

    window.dispatchEvent(new Event('pagehide'))
    await flushPromises()
    // 頁面其實沒被關掉（行動瀏覽器的 pagehide 可能只是進 bfcache）：後續的定期送出
    // 不得把已交給 keepalive 的那批再送一次，否則軌跡會出現重複點。
    await advanceToFlush()

    expect(postBusPingsKeepalive).toHaveBeenCalledTimes(1)
    expect(sentPoints()).toEqual([])
  })

  it('pagehide 時把「還在飛的那一批」一併交給 keepalive（頁面關閉會取消 XHR）', async () => {
    await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)
    // 讓 shipOutbox 送出但永不 settle：模擬請求正在飛的當下頁面被關掉。
    vi.mocked(postBusPings).mockImplementation((() => new Promise(() => {})) as never)
    await advanceToFlush()

    window.dispatchEvent(new Event('pagehide'))
    await flushPromises()

    expect(postBusPingsKeepalive).toHaveBeenCalledTimes(1)
    const [, points] = vi.mocked(postBusPingsKeepalive).mock.calls[0]
    expect((points as Array<{ at: string }>).map((p) => p.at)).toEqual(['2026-07-29T09:00:00.000Z'])
  })

  it('停止追蹤後 pagehide 不再送出（監聽器已移除）', async () => {
    const bus = await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)
    bus.teardown()
    await flushPromises()
    vi.mocked(postBusPingsKeepalive).mockClear()

    window.dispatchEvent(new Event('pagehide'))
    await flushPromises()

    expect(postBusPingsKeepalive).not.toHaveBeenCalled()
  })

  it('停止追蹤後轉為隱藏不再送出（監聽器已移除）', async () => {
    const bus = await bootWithActiveTrip()
    bus.teardown()
    await flushPromises()
    const before = vi.mocked(postBusPings).mock.calls.length

    emitPosition(LOCAL_NOW_MS)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    }

    expect(postBusPings).toHaveBeenCalledTimes(before)
  })

  it('連續多顆 timestamp 都不是 epoch 基準時改用本機時間並亮出訊號', async () => {
    const bus = await bootWithActiveTrip()
    // 相對時間基準（開機以來的毫秒數）：每顆都偏離「現在」超過一小時
    for (let i = 0; i < SUSPECT_TIMESTAMP_STREAK; i += 1) {
      emitPosition(12345 + i * 1000)
      await vi.advanceTimersByTimeAsync(1000)
    }
    await advanceToFlush()

    expect(bus.gpsClockSuspect.value).toBe(true)
    // 前兩顆仍照 buffer 的 skew 防線被拒，第三顆起改用本機時間送出
    expect(sentPoints().map((p) => p.at)).toEqual(['2026-07-29T09:00:02.000Z'])
  })

  it('偶發單顆暴衝不觸發改用本機時間（仍由 skew 防線拒收）', async () => {
    const bus = await bootWithActiveTrip()
    // 三顆暴衝但互不相鄰：連段每次都被正常點打斷，不得累積成「系統性」
    for (const offsetMs of [0, 1000, 2000, 3000, 4000, 5000]) {
      const spike = offsetMs % 2000 === 0
      emitPosition(spike ? Date.UTC(3000, 0, 1) : LOCAL_NOW_MS + offsetMs)
      await vi.advanceTimersByTimeAsync(1000)
    }
    await advanceToFlush()

    expect(bus.gpsClockSuspect.value).toBe(false)
    // 只有三顆正常點被收下，三顆暴衝仍由 skew 防線拒收
    expect(sentPoints().map((p) => p.at)).toEqual([
      '2026-07-29T09:00:01.000Z',
      '2026-07-29T09:00:03.000Z',
      '2026-07-29T09:00:05.000Z',
    ])
  })

  it('分頁被隱藏時不去搶 Wake Lock（瀏覽器會直接拒絕）', async () => {
    await bootWithActiveTrip()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()
      expect(wakeLock.request).toHaveBeenCalledTimes(1) // 只有 beginTracking 那次
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    }
  })

  it('停止追蹤後回前景不再取得 Wake Lock（監聽器已移除）', async () => {
    const bus = await bootWithActiveTrip()
    bus.teardown()
    await flushPromises()

    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(wakeLock.request).toHaveBeenCalledTimes(1)
  })

  it('定位失敗回呼把 gpsActive 設回 false', async () => {
    const bus = await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)
    expect(bus.gpsActive.value).toBe(true)

    watchErrCb?.({ code: 1, message: 'denied' })
    expect(bus.gpsActive.value).toBe(false)
  })

  // Task 1: GPS 權限被拒與其他定位失敗（POSITION_UNAVAILABLE / TIMEOUT）必須分開呈現，
  // 因為「重試」對權限被拒完全沒用——司機得去瀏覽器/系統設定開權限。
  it('PositionError.code === 1（PERMISSION_DENIED）時亮出可行動的權限提示', async () => {
    const bus = await bootWithActiveTrip()

    watchErrCb?.({ code: 1, message: 'User denied Geolocation' })

    expect(bus.gpsPermissionDenied.value).toBe(true)
    expect(bus.gpsActive.value).toBe(false)
  })

  it('code === 2（POSITION_UNAVAILABLE）不得誤判為權限被拒', async () => {
    const bus = await bootWithActiveTrip()

    watchErrCb?.({ code: 2, message: 'Position unavailable' })

    expect(bus.gpsPermissionDenied.value).toBe(false)
    expect(bus.gpsActive.value).toBe(false)
  })

  it('code === 3（TIMEOUT）不得誤判為權限被拒', async () => {
    const bus = await bootWithActiveTrip()

    watchErrCb?.({ code: 3, message: 'Timeout' })

    expect(bus.gpsPermissionDenied.value).toBe(false)
    expect(bus.gpsActive.value).toBe(false)
  })

  it('拿到真正的位置後解除權限被拒旗標（例如司機事後去設定開了權限）', async () => {
    const bus = await bootWithActiveTrip()
    watchErrCb?.({ code: 1, message: 'denied' })
    expect(bus.gpsPermissionDenied.value).toBe(true)

    emitPosition(LOCAL_NOW_MS)

    expect(bus.gpsPermissionDenied.value).toBe(false)
    expect(bus.gpsActive.value).toBe(true)
  })
})

// Task 2: 裝置不支援定位（`!('geolocation' in navigator)`）時，站點動作重試佇列與
// 週期性核對（resyncActiveTrip）不該因此永遠不啟動——兩者都與 GPS 是否有點無關，
// 前者只依賴網路，後者的存在理由正是「涵蓋沒有 GPS 點」的情境。
describe('usePortalBusTrip — 裝置不支援定位時的背景計時器', () => {
  it('不支援定位仍要啟動站點重試佇列送出計時器（stopRetryQueue 不得永遠卡住）', async () => {
    stubNoGeolocation()
    try {
      const bus = await bootWithActiveTrip()
      expect(bus.gpsSupported.value).toBe(false)

      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(undefined))
      await bus.departStop({ stop_id: 11 } as never)
      await settleDepart()
      await flushPromises()
      expect(bus.pendingStopActionCount.value).toBe(1)

      vi.mocked(departBusStop).mockResolvedValueOnce(resp({
        stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
      }) as never)
      await vi.advanceTimersByTimeAsync(PING_FLUSH_INTERVAL_MS)
      await flushPromises()

      expect(bus.pendingStopActionCount.value).toBe(0)
    } finally {
      restoreGeolocation()
    }
  })

  it('不支援定位仍要啟動週期性核對（班次消失仍要被發現）', async () => {
    stubNoGeolocation()
    try {
      const bus = await bootWithActiveTrip()
      vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null }) as never)

      await vi.advanceTimersByTimeAsync(ACTIVE_TRIP_RESYNC_INTERVAL_MS)
      await flushPromises()

      expect(bus.trip.value).toBeNull()
      expect(ElMessage.warning).toHaveBeenCalled()
    } finally {
      restoreGeolocation()
    }
  })

  it('teardown 時仍要對稱清理計時器（不支援定位路徑也不得留下孤兒 interval）', async () => {
    stubNoGeolocation()
    try {
      const bus = await bootWithActiveTrip()
      bus.teardown()
      await flushPromises()
      const callsBefore = vi.mocked(getActiveBusTrip).mock.calls.length

      await vi.advanceTimersByTimeAsync(ACTIVE_TRIP_RESYNC_INTERVAL_MS * 2)
      await flushPromises()

      expect(vi.mocked(getActiveBusTrip).mock.calls.length).toBe(callsBefore)
    } finally {
      restoreGeolocation()
    }
  })
})

describe('usePortalBusTrip — 上報失敗與重送', () => {
  it('網路錯誤的批次會在下一批一起重送（onFlush 拋錯不得靜默丟包）', async () => {
    await bootWithActiveTrip()
    vi.mocked(postBusPings).mockRejectedValueOnce(axiosError(undefined))

    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()
    emitPosition(LOCAL_NOW_MS + PING_FLUSH_INTERVAL_MS + 1000)
    await advanceToFlush()

    expect(postBusPings).toHaveBeenCalledTimes(2)
    expect(vi.mocked(postBusPings).mock.calls[1][1].map((p) => p.at)).toEqual([
      '2026-07-29T09:00:00.000Z',
      '2026-07-29T09:00:06.000Z',
    ])
  })

  it('422（整批含不合法點）直接丟棄，不無限重送毒藥批次', async () => {
    await bootWithActiveTrip()
    vi.mocked(postBusPings).mockRejectedValueOnce(axiosError(422))

    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()
    emitPosition(LOCAL_NOW_MS + PING_FLUSH_INTERVAL_MS + 1000)
    await advanceToFlush()

    expect(vi.mocked(postBusPings).mock.calls[1][1].map((p) => p.at)).toEqual([
      '2026-07-29T09:00:06.000Z',
    ])
  })

  it('409（班次已在他處結束）停止追蹤並清掉班次狀態', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(postBusPings).mockRejectedValueOnce(axiosError(409, '班次已結束'))

    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()

    expect(bus.trip.value).toBeNull()
    expect(geolocation.clearWatch).toHaveBeenCalledWith(42)
    expect(ElMessage.warning).toHaveBeenCalled()

    // 停止後殘留的 watchPosition 回呼不得再收集座標
    const before = vi.mocked(postBusPings).mock.calls.length
    emitPosition(LOCAL_NOW_MS + 10000)
    await advanceToFlush()
    expect(postBusPings).toHaveBeenCalledTimes(before)
  })

  it('待重送的點滿 30 筆時丟最舊（後端 max_length=30；保住最新軌跡）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(postBusPings).mockRejectedValue(axiosError(undefined))

    for (let i = 0; i < 40; i += 1) {
      emitPosition(LOCAL_NOW_MS + i * 1000)
      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()
    }

    expect(bus.pendingPingCount.value).toBe(30)
    const lastBatch = vi.mocked(postBusPings).mock.calls.at(-1)?.[1] as Array<{ at: string }>
    expect(lastBatch).toHaveLength(30)
    // 留下的是最新 30 筆：最舊那筆不得是第 0 秒
    expect(lastBatch[0].at).not.toBe('2026-07-29T09:00:00.000Z')
    expect(new Date(lastBatch[0].at).getTime()).toBeGreaterThan(LOCAL_NOW_MS)
  })

  it('前一批仍在送出時不併發送出第二批（等下一輪一起送，維持時序）', async () => {
    await bootWithActiveTrip()
    let resolveFirst: (v: unknown) => void = () => {}
    vi.mocked(postBusPings).mockReturnValueOnce(new Promise((r) => { resolveFirst = r }) as never)

    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()
    expect(postBusPings).toHaveBeenCalledTimes(1)

    emitPosition(LOCAL_NOW_MS + 6000)
    await advanceToFlush()
    expect(postBusPings).toHaveBeenCalledTimes(1)

    resolveFirst(respNow(null))
    await flushPromises()
    await advanceToFlush()
    expect(postBusPings).toHaveBeenCalledTimes(2)
  })

  it('後續回應缺 Date header 時沿用既有偏差（不得歸零）', async () => {
    const bus = await bootWithActiveTrip('Wed, 29 Jul 2026 10:00:00 GMT')
    // 站點操作的回應沒有 Date header
    vi.mocked(departBusStop).mockResolvedValue(resp({ stops: [] }, '') as never)
    await bus.departStop({ stop_id: 11 } as never)
    await settleDepart()
    await flushPromises()

    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()

    expect(sentPoints().map((p) => p.at)).toEqual([
      new Date(LOCAL_NOW_MS + ONE_HOUR_MS).toISOString(),
    ])
  })

  it('teardown 之後送出計時器停擺（不得在離開頁面後繼續重試）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(postBusPings).mockRejectedValue(axiosError(undefined))

    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()
    bus.teardown()
    await flushPromises()
    const afterTeardown = vi.mocked(postBusPings).mock.calls.length

    await advanceToFlush(3)

    expect(postBusPings).toHaveBeenCalledTimes(afterTeardown)
    expect(bus.pendingPingCount.value).toBeGreaterThan(0)
  })

  it('重送時舊點排在送出中期間新收的點之前（時序不得倒置）', async () => {
    await bootWithActiveTrip()
    let rejectFirst: (e: unknown) => void = () => {}
    vi.mocked(postBusPings).mockReturnValueOnce(
      new Promise((_r, rej) => { rejectFirst = rej }) as never,
    )

    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()          // 第一批送出中（尚未失敗）
    emitPosition(LOCAL_NOW_MS + 6000)
    await advanceToFlush()          // 新點被 buffer 搬進 outbox，送出被併發守衛擋下

    rejectFirst(axiosError(undefined))
    await flushPromises()
    await advanceToFlush()

    expect(vi.mocked(postBusPings).mock.calls[1][1].map((p) => p.at)).toEqual([
      '2026-07-29T09:00:00.000Z',
      '2026-07-29T09:00:06.000Z',
    ])
  })

  it('待重送筆數對外可見（UI 可提示未送出）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(postBusPings).mockRejectedValueOnce(axiosError(undefined))

    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()
    expect(bus.pendingPingCount.value).toBe(1)

    await advanceToFlush()
    expect(bus.pendingPingCount.value).toBe(0)
  })
})

describe('usePortalBusTrip — 週期性核對班次是否仍存在', () => {
  // Task 2: 唯一能發現「班次已不存在」的既有路徑是 shipOutbox 送 ping 時收到 409/404。
  // 當 GPS 完全沒有點（權限被拒／不支援）時 outbox 永遠是空的，這條路徑等於失效——
  // 班次被排程器逾時關閉或被另一台裝置結束時，司機畫面會永遠停在「進行中」。
  // 這裡驗證一條不依賴 ping 管線的週期性核對。

  it('GPS 完全沒有點時（outbox 恆為空），週期性核對仍能發現班次已消失', async () => {
    const bus = await bootWithActiveTrip()
    // 完全不 emitPosition：outbox 永遠是空的，shipOutbox 那條偵測路徑必然失效。
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null }) as never)

    await vi.advanceTimersByTimeAsync(ACTIVE_TRIP_RESYNC_INTERVAL_MS)
    await flushPromises()

    expect(bus.trip.value).toBeNull()
    expect(geolocation.clearWatch).toHaveBeenCalledWith(42)
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('未到週期性核對的時間點不觸發（避免過度頻繁打行動網路）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null }) as never)

    await vi.advanceTimersByTimeAsync(ACTIVE_TRIP_RESYNC_INTERVAL_MS - 1)
    await flushPromises()

    expect(bus.trip.value).not.toBeNull()
  })

  it('班次仍存在時週期性核對不動任何狀態（只是核對，非重載）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload()) as never)
    const watchCallsBefore = geolocation.watchPosition.mock.calls.length

    await vi.advanceTimersByTimeAsync(ACTIVE_TRIP_RESYNC_INTERVAL_MS)
    await flushPromises()

    expect(bus.trip.value?.id).toBe(7)
    // beginTracking 在核對成功時仍會被呼叫，但已在追蹤中應是 no-op，不得重開一組 watch
    expect(geolocation.watchPosition.mock.calls.length).toBe(watchCallsBefore)
  })

  it('週期性核對遇到網路暫時失敗時靜默忽略，不打斷司機（下一輪再試）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(getActiveBusTrip).mockRejectedValueOnce(axiosError(undefined))

    await vi.advanceTimersByTimeAsync(ACTIVE_TRIP_RESYNC_INTERVAL_MS)
    await flushPromises()

    expect(bus.trip.value?.id).toBe(7) // 沒被誤判成消失
  })

  // Major（PII 洩漏）：resyncActiveTrip 沒帶 mine=true，若同 route+direction 已被
  // 另一位司機（B）開了新班次，A 的週期核對會把 B 的班次（含學生姓名與家庭座標）
  // 直接接手覆寫進 A 的畫面，且 A 的 GPS 會灌進 B 的班次。resyncActiveTrip 只該用來
  // 確認「我手上這張是否還在」，trip.id 不同就該視為「我的班次已消失」。
  it('週期性核對回傳的是別的班次（trip.id 不同）時視為原班次已消失，不得接手新班次', async () => {
    const bus = await bootWithActiveTrip() // trip.id === 7
    // B 司機在同一 route+direction 開了新班次（id=99），含 B 班次的學生名冊
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload({ id: 99 })) as never)

    await vi.advanceTimersByTimeAsync(ACTIVE_TRIP_RESYNC_INTERVAL_MS)
    await flushPromises()

    // 不得接手 B 的班次
    expect(bus.trip.value).toBeNull()
    expect(geolocation.clearWatch).toHaveBeenCalledWith(42)
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('分頁回前景時也核對一次（不必等到下一個週期）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null }) as never)

    document.dispatchEvent(new Event('visibilitychange')) // 預設 visibilityState 已是 'visible'
    await flushPromises()

    expect(bus.trip.value).toBeNull()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('teardown 之後週期性核對停擺', async () => {
    const bus = await bootWithActiveTrip()
    bus.teardown()
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null }) as never)
    const callsBefore = vi.mocked(getActiveBusTrip).mock.calls.length

    await vi.advanceTimersByTimeAsync(ACTIVE_TRIP_RESYNC_INTERVAL_MS * 2)
    await flushPromises()

    expect(vi.mocked(getActiveBusTrip).mock.calls.length).toBe(callsBefore)
  })
})

describe('usePortalBusTrip — 站點操作', () => {
  it('離站成功後以回應的 stops 覆寫', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({
      stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
    }) as never)

    await bus.departStop(bus.stops.value[0])
    await settleDepart()

    expect(departBusStop).toHaveBeenCalledWith(7, 11)
    expect(bus.stops.value.map((s) => s.status)).toEqual(['departed'])
  })

  it('跳站與撤銷各自打對應端點', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(skipBusStop).mockResolvedValue(resp({ stops: [] }) as never)
    vi.mocked(undoBusStop).mockResolvedValue(resp({ stops: [] }) as never)

    await bus.skipStop({ stop_id: 12 } as never)
    await bus.undoStop({ stop_id: 12 } as never)

    expect(skipBusStop).toHaveBeenCalledWith(7, 12)
    expect(undoBusStop).toHaveBeenCalledWith(7, 12)
  })

  it('409（此站已處理）時重新同步班次狀態，不留下錯誤畫面', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockRejectedValue(axiosError(409, '此站已處理'))
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({
      trip: { id: 7, route_id: 3, direction: 'morning', status: 'in_progress' },
      stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
    }) as never)

    await bus.departStop({ stop_id: 11 } as never)
    await settleDepart()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('此站已處理')
    // 接手／重新同步一律 `mine=false`：後端刻意允許任一持 BUS_TRIPS_OPERATE 的帳號
    // 接手別人開的班次（司機中途換手），帶 mine 會把換手情境擋成「查無班次」。
    expect(getActiveBusTrip).toHaveBeenLastCalledWith(3, null, false)
    expect(bus.stops.value.map((s) => s.status)).toEqual(['departed'])
    // 重新同步時已在追蹤中，不得再開一組 watch／計時器（舊的會變成無人持有的孤兒）
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
  })

  it('一般錯誤只提示，不重打 active 快照', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockRejectedValue(axiosError(500))
    const before = vi.mocked(getActiveBusTrip).mock.calls.length

    await bus.departStop({ stop_id: 11 } as never)
    await settleDepart()
    await flushPromises()

    expect(getActiveBusTrip).toHaveBeenCalledTimes(before)
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('送出中的站點 id 對外可見（UI 可鎖按鈕防重複點擊）', async () => {
    const bus = await bootWithActiveTrip()
    let resolveDepart: (v: unknown) => void = () => {}
    vi.mocked(departBusStop).mockReturnValue(new Promise((r) => { resolveDepart = r }) as never)

    await bus.departStop({ stop_id: 11 } as never)
    // 緩衝期內尚未送出，整列不該被鎖住——司機還要能按取消
    expect(bus.actingStopId.value).toBeNull()

    // 倒數到期真的送出後才鎖
    await vi.advanceTimersByTimeAsync(DEPART_UNDO_WINDOW_MS)
    expect(bus.actingStopId.value).toBe(11)
    // 送出中不接受第二個站點操作（司機在晃動的車上很容易連點）
    await bus.skipStop({ stop_id: 12 } as never)
    expect(skipBusStop).not.toHaveBeenCalled()

    resolveDepart(resp({ stops: [] }))
    await flushPromises()
    expect(bus.actingStopId.value).toBeNull()
  })

  // Task 3：站點動作失敗只跳一個會消失的 toast，行駛中訊號短暫中斷時司機不會盯著螢幕看，
  // 該站就停在 pending、家長端進度顯示錯誤。網路類失敗（無 response / 5xx）要能自動重試，
  // 並用「持續存在的 UI 狀態」（不是會消失的 toast）讓司機看得到還有幾個動作待重送。
  describe('失敗重送（強健性比照 GPS ping 的 outbox）', () => {
    it('網路錯誤（無 response）進重試佇列，且待重送筆數對外可見', async () => {
      const bus = await bootWithActiveTrip()
      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(undefined))

      await bus.departStop({ stop_id: 11 } as never)
      await settleDepart()
      await flushPromises()

      expect(bus.pendingStopActionCount.value).toBe(1)
    })

    it('5xx 進重試佇列', async () => {
      const bus = await bootWithActiveTrip()
      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(503))

      await bus.departStop({ stop_id: 11 } as never)
      await settleDepart()
      await flushPromises()

      expect(bus.pendingStopActionCount.value).toBe(1)
    })

    it('下一輪自動重送成功後從佇列移除並套用最新 stops', async () => {
      const bus = await bootWithActiveTrip()
      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(undefined))
      await bus.departStop({ stop_id: 11 } as never)
      await settleDepart()
      await flushPromises()
      expect(bus.pendingStopActionCount.value).toBe(1)

      vi.mocked(departBusStop).mockResolvedValueOnce(resp({
        stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
      }) as never)
      await vi.advanceTimersByTimeAsync(PING_FLUSH_INTERVAL_MS)
      await flushPromises()

      expect(bus.pendingStopActionCount.value).toBe(0)
      expect(bus.stops.value.find((s) => s.stop_id === 11)?.status).toBe('departed')
      expect(departBusStop).toHaveBeenCalledTimes(2)
    })

    it('重送遇到 409（此站已處理）視為已完成：從佇列移除、重抓權威狀態，不算錯誤', async () => {
      const bus = await bootWithActiveTrip()
      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(undefined))
      await bus.departStop({ stop_id: 11 } as never)
      await settleDepart()
      await flushPromises()
      expect(bus.pendingStopActionCount.value).toBe(1)

      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(409, '此站已處理'))
      vi.mocked(getActiveBusTrip).mockResolvedValue(resp({
        trip: { id: 7, route_id: 3, direction: 'morning', status: 'in_progress' },
        stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
      }) as never)
      const errorCallsBefore = vi.mocked(ElMessage.error).mock.calls.length

      await vi.advanceTimersByTimeAsync(PING_FLUSH_INTERVAL_MS)
      await flushPromises()

      expect(bus.pendingStopActionCount.value).toBe(0)
      expect(bus.stops.value.find((s) => s.stop_id === 11)?.status).toBe('departed')
      // 重送觸發的 409 不是新錯誤（已由第一次失敗提示過），不得再彈一次
      expect(vi.mocked(ElMessage.error).mock.calls.length).toBe(errorCallsBefore)
    })

    // Task 4: 重送遇 409 代表這站已被別的裝置改了狀態，畫面雖然正確但司機以為自己
    // 剛才的操作成功了。要用 info（非 error，避免誘發司機重按）明講一次。
    it('重送遇 409 時給一則 info 提示，告知站點已由其他裝置更新', async () => {
      const bus = await bootWithActiveTrip()
      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(undefined))
      await bus.departStop({ stop_id: 11 } as never)
      await settleDepart()
      await flushPromises()

      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(409, '此站已處理'))
      vi.mocked(getActiveBusTrip).mockResolvedValue(resp({
        trip: { id: 7, route_id: 3, direction: 'morning', status: 'in_progress' },
        stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'skipped' }],
      }) as never)

      await vi.advanceTimersByTimeAsync(PING_FLUSH_INTERVAL_MS)
      await flushPromises()

      expect(ElMessage.info).toHaveBeenCalled()
      expect(ElMessage.error).not.toHaveBeenCalledWith(expect.stringContaining('此站已處理'))
    })

    it('4xx（非 409，例如 403）不重試：不進佇列，直接呈現錯誤', async () => {
      const bus = await bootWithActiveTrip()
      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(403, '無權限操作此站'))

      await bus.departStop({ stop_id: 11 } as never)
      await settleDepart()
      await flushPromises()

      expect(bus.pendingStopActionCount.value).toBe(0)
      expect(ElMessage.error).toHaveBeenCalledWith('無權限操作此站')

      await vi.advanceTimersByTimeAsync(PING_FLUSH_INTERVAL_MS * 3)
      await flushPromises()
      expect(departBusStop).toHaveBeenCalledTimes(1) // 沒有被重送
    })

    it('404（站點不存在）不重試：不進佇列', async () => {
      const bus = await bootWithActiveTrip()
      vi.mocked(skipBusStop).mockRejectedValueOnce(axiosError(404))

      await bus.skipStop({ stop_id: 11 } as never)
      await flushPromises()

      expect(bus.pendingStopActionCount.value).toBe(0)
    })

    it('佇列裡排著別站別 kind 的動作時，某動作成功不得連帶丟掉同站不同 kind 的待重送', async () => {
      const bus = await bootWithActiveTrip()
      // 同一站先前的 skip 因網路錯誤進了佇列，仍待重送。
      // ⚠ 持續 reject（不是 Once）：離站緩衝期（DEPART_UNDO_WINDOW_MS）與 ping 送出
      // 週期（PING_FLUSH_INTERVAL_MS）同為 5 秒，推進緩衝期必然順帶跑一輪重送——
      // 用 Once 的話那一輪會讓 skip「意外成功」而清空佇列，斷言就測不到原本要測的
      // dequeue 誤刪。持續失敗＝網路尚未恢復，才是這個測試設定的情境。
      vi.mocked(skipBusStop).mockRejectedValue(axiosError(undefined))
      await bus.skipStop({ stop_id: 11 } as never)
      await flushPromises()
      expect(bus.pendingStopActionCount.value).toBe(1)

      // 司機接著對同一站發起一次全新的 depart 動作（非重送、非同一筆），且這次成功
      vi.mocked(departBusStop).mockResolvedValueOnce(resp({ stops: [] }) as never)
      await bus.departStop({ stop_id: 11 } as never)
      await settleDepart()
      await flushPromises()

      // depart 成功只該清掉 depart 自己（佇列裡根本沒有它），佇列裡待重送的 skip
      // 不得被 dequeue 誤刪——if it only compares stopId 這裡會被清成 0，是 bug。
      expect(bus.pendingStopActionCount.value).toBe(1)
    })

    it('班次已消失時清空重試佇列（動作已無意義，不留孤兒重試）', async () => {
      const bus = await bootWithActiveTrip()
      vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(undefined))
      await bus.departStop({ stop_id: 11 } as never)
      await settleDepart()
      await flushPromises()
      expect(bus.pendingStopActionCount.value).toBe(1)

      vi.mocked(postBusPings).mockRejectedValueOnce(axiosError(409, '班次已結束'))
      emitPosition(LOCAL_NOW_MS)
      await advanceToFlush()

      expect(bus.trip.value).toBeNull()
      expect(bus.pendingStopActionCount.value).toBe(0)
    })

    it('離站成功時若後端回 notification_warning：輕量提示家長通知可能延遲，不當成錯誤', async () => {
      const bus = await bootWithActiveTrip()
      vi.mocked(departBusStop).mockResolvedValue(resp({
        stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
        notification_warning: true,
      }) as never)

      await bus.departStop(bus.stops.value[0])
      await settleDepart()
      await flushPromises()

      expect(ElMessage.error).not.toHaveBeenCalled()
      expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('家長通知'))
    })
  })
})

describe('usePortalBusTrip — 結束班次', () => {
  it('最後一批未滿 5 秒的點必須在結束班次前送出（結束後上報會被 409 退回）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(completeBusTrip).mockResolvedValue(resp({ trip: { id: 7, status: 'completed' } }) as never)
    emitPosition(LOCAL_NOW_MS)

    await bus.complete()
    await flushPromises()

    expect(postBusPings).toHaveBeenCalledTimes(1)
    expect(sentPoints().map((p) => p.at)).toEqual(['2026-07-29T09:00:00.000Z'])
    const pingOrder = vi.mocked(postBusPings).mock.invocationCallOrder[0]
    const completeOrder = vi.mocked(completeBusTrip).mock.invocationCallOrder[0]
    expect(pingOrder).toBeLessThan(completeOrder)
  })

  it('結束後清空狀態、停止追蹤，殘留回呼不再收集座標', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(completeBusTrip).mockResolvedValue(resp({ trip: { id: 7 } }) as never)

    await bus.complete()
    await flushPromises()

    expect(bus.trip.value).toBeNull()
    expect(bus.stops.value).toEqual([])
    expect(geolocation.clearWatch).toHaveBeenCalledWith(42)
    expect(wakeLockSentinel.release).toHaveBeenCalled()

    const before = vi.mocked(postBusPings).mock.calls.length
    emitPosition(LOCAL_NOW_MS + 10000)
    await advanceToFlush()
    expect(postBusPings).toHaveBeenCalledTimes(before)
  })

  it('結束成功後重抓班次列表（回到開班卡時四態不得停留在過期快照）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(completeBusTrip).mockResolvedValue(resp({ trip: { id: 7 } }) as never)
    const callsBefore = vi.mocked(listPortalBusRoutes).mock.calls.length
    vi.mocked(listPortalBusRoutes).mockResolvedValue(resp({
      routes: [routeItem({ today_status: 'completed', today_trip_id: 7 })],
    }) as never)

    await bus.complete()
    await flushPromises()

    expect(vi.mocked(listPortalBusRoutes).mock.calls.length).toBe(callsBefore + 1)
    expect(bus.routes.value[0].today_status).toBe('completed')
  })

  it('使用者取消確認時什麼都不做，GPS 繼續跑', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(ElMessageBox.confirm).mockRejectedValue(new Error('cancel'))

    await bus.complete()
    await flushPromises()

    expect(completeBusTrip).not.toHaveBeenCalled()
    expect(bus.trip.value?.id).toBe(7)
    expect(geolocation.clearWatch).not.toHaveBeenCalled()

    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()
    expect(postBusPings).toHaveBeenCalledTimes(1)
  })

  it('結束 API 失敗時班次保留並恢復追蹤（不可讓司機以為已結束卻仍在路上）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(completeBusTrip).mockRejectedValue(axiosError(500))

    await bus.complete()
    await flushPromises()

    expect(bus.trip.value?.id).toBe(7)
    expect(ElMessage.error).toHaveBeenCalled()
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2)

    emitPosition(LOCAL_NOW_MS + 20000)
    await advanceToFlush()
    expect(sentPoints().map((p) => p.at)).toEqual(['2026-07-29T09:00:20.000Z'])
  })
})

describe('usePortalBusTrip — 離開頁面', () => {
  it('teardown 會送出最後一批並停止追蹤', async () => {
    const bus = await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)

    bus.teardown()
    await flushPromises()

    expect(sentPoints().map((p) => p.at)).toEqual(['2026-07-29T09:00:00.000Z'])
    expect(geolocation.clearWatch).toHaveBeenCalledWith(42)

    const before = vi.mocked(postBusPings).mock.calls.length
    emitPosition(LOCAL_NOW_MS + 10000)
    await advanceToFlush()
    expect(postBusPings).toHaveBeenCalledTimes(before)
  })

  it('teardown 可重複呼叫而不重複 clearWatch', async () => {
    const bus = await bootWithActiveTrip()
    bus.teardown()
    bus.teardown()
    await flushPromises()

    expect(geolocation.clearWatch).toHaveBeenCalledTimes(1)
  })
})

describe('usePortalBusTrip — 隱私守衛', () => {
  it('全流程不得把座標寫進 console 或任何 storage', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    )
    const localSet = vi.spyOn(Storage.prototype, 'setItem')

    const bus = await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()
    vi.mocked(completeBusTrip).mockResolvedValue(resp({ trip: { id: 7 } }) as never)
    await bus.complete()
    await flushPromises()

    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled())
    expect(localSet).not.toHaveBeenCalled()
    consoleSpies.forEach((spy) => spy.mockRestore())
    localSet.mockRestore()
  })

  it('上報失敗時的錯誤訊息不含座標', async () => {
    await bootWithActiveTrip()
    vi.mocked(postBusPings).mockRejectedValueOnce(axiosError(409, '班次已結束'))
    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()

    const texts = [
      ...vi.mocked(ElMessage.warning).mock.calls,
      ...vi.mocked(ElMessage.error).mock.calls,
    ].map((c) => String(c[0]))
    texts.forEach((t) => {
      expect(t).not.toContain('22.6')
      expect(t).not.toContain('120.3')
    })
  })
})

describe('測試輔助函式自檢', () => {
  it('emitPosition 的 timestamp 差異真的會傳到 at（helper 沒有把毫秒截掉）', async () => {
    await bootWithActiveTrip()
    emitPosition(LOCAL_NOW_MS)
    emitPosition(LOCAL_NOW_MS + 1001)
    await advanceToFlush()

    const ats = sentPoints().map((p) => p.at)
    expect(ats).toEqual(['2026-07-29T09:00:00.000Z', '2026-07-29T09:00:01.001Z'])
    expect(new Set(ats).size).toBe(ats.length)
  })

  it('respNow 的 Date header 跟著假時鐘走（固定字串會把偏差靜默算成負值）', () => {
    const a = respNow(null).headers.date
    vi.setSystemTime(LOCAL_NOW_MS + 60000)
    const b = respNow(null).headers.date
    try {
      expect(a).not.toBe(b)
      expect(Date.parse(b) - Date.parse(a)).toBe(60000)
    } finally {
      vi.setSystemTime(LOCAL_NOW_MS)
    }
  })

  it('respNow 的 Date header 只有秒級解析度（測試時間必須落在整秒）', () => {
    vi.setSystemTime(LOCAL_NOW_MS + 1500)
    try {
      // 毫秒被截掉：1500ms 的時間點算出來的 header 只到第 1 秒
      expect(Date.parse(respNow(null).headers.date)).toBe(LOCAL_NOW_MS + 1000)
      vi.setSystemTime(LOCAL_NOW_MS + 1999)
      expect(Date.parse(respNow(null).headers.date)).toBe(LOCAL_NOW_MS + 1000)
      vi.setSystemTime(LOCAL_NOW_MS + 2000)
      expect(Date.parse(respNow(null).headers.date)).toBe(LOCAL_NOW_MS + 2000)
    } finally {
      vi.setSystemTime(LOCAL_NOW_MS)
    }
  })

  it('axiosError 造出的物件確實帶得出 status 與 detail', () => {
    const e = axiosError(409, { message: 'x', trip_id: 1 }) as {
      response?: { status?: number; data?: { detail?: unknown } }
    }
    expect(e.response?.status).toBe(409)
    expect(e.response?.data?.detail).toEqual({ message: 'x', trip_id: 1 })
    expect((axiosError(undefined) as { response?: unknown }).response).toBeUndefined()
  })

  it('resp 造出的 Date header 真的會被讀成偏差（偏差 0 與 1 小時可區分）', async () => {
    await bootWithActiveTrip('Wed, 29 Jul 2026 10:00:00 GMT')
    emitPosition(LOCAL_NOW_MS)
    await advanceToFlush()
    expect(sentPoints()[0].at).toBe(new Date(LOCAL_NOW_MS + ONE_HOUR_MS).toISOString())
  })
})

describe('usePortalBusTrip — excused 是當日不搭的單一事實來源（FE-PORTAL-01）', () => {
  function excusedPayload() {
    return {
      trip: { id: 7, route_id: 3, direction: 'morning', status: 'in_progress' },
      stops: [
        {
          stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'excused',
          excuse_reason: 'parent', address: '高雄市三民區某路 1 號',
          contacts: [{ name: '王媽媽', phone: '0912345678' }],
          eta_planned: '2026-08-26T07:35:00', eta_live: null,
        },
        {
          stop_id: 12, student_id: 102, student_name: '小華', seq: 2, status: 'pending',
          address: '高雄市三民區某路 9 號',
          contacts: [{ name: '李爸爸', phone: '0987654321' }],
          eta_planned: '2026-08-26T07:40:00', eta_live: '2026-08-26T07:43:00',
        },
      ],
    }
  }

  async function bootExcused() {
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(excusedPayload()) as never)
    const bus = createBus()
    await bus.init()
    await flushPromises()
    return bus
  }

  it('第二期新欄位（地址／聯絡人／ETA／excuse_reason）完整進狀態供卡片渲染', async () => {
    const bus = await bootExcused()
    const [excused, pending] = bus.stops.value

    expect(excused.status).toBe('excused')
    expect(excused.excuse_reason).toBe('parent')
    expect(pending.address).toBe('高雄市三民區某路 9 號')
    expect(pending.contacts?.[0]).toEqual({ name: '李爸爸', phone: '0987654321' })
    expect(pending.eta_live).toBe('2026-08-26T07:43:00')
  })

  it('excused 站不可離站／跳過／撤銷（司機端不提供恢復，spec 明文）', async () => {
    const bus = await bootExcused()
    const excused = bus.stops.value[0]

    await bus.departStop(excused as never)
    await settleDepart()
    await bus.skipStop(excused as never)
    await bus.undoStop(excused as never)
    await flushPromises()

    expect(departBusStop).not.toHaveBeenCalled()
    expect(skipBusStop).not.toHaveBeenCalled()
    expect(undoBusStop).not.toHaveBeenCalled()
  })

  it('守衛以 stops 內的權威狀態判定，不信呼叫端傳進來的舊物件', async () => {
    // resync／重排後，畫面上那份 stop 物件可能還是舊的（status=pending），
    // 若照著它判定就會對一個已經 excused 的站送出離站。
    const bus = await bootExcused()
    const staleObject = { stop_id: 11, status: 'pending' }

    await bus.departStop(staleObject as never)
    await settleDepart()
    await flushPromises()

    expect(departBusStop).not.toHaveBeenCalled()
  })

  it('pending 站不受影響，照常可以離站', async () => {
    const bus = await bootExcused()
    vi.mocked(departBusStop).mockResolvedValue(resp(excusedPayload()) as never)

    await bus.departStop(bus.stops.value[1] as never)
    await settleDepart()
    await flushPromises()

    expect(departBusStop).toHaveBeenCalledWith(7, 12)
  })

  it('第一期的 on_leave 完全不再影響流程（excused 已取代它）', async () => {
    // 後端 build_admin_stops_payload 已不回這個欄位。若前端還殘留任何對它的
    // 判斷，帶著 on_leave=true 的 pending 站會被誤當成不可操作。
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({
      trip: { id: 7, route_id: 3, direction: 'morning', status: 'in_progress' },
      stops: [{
        stop_id: 11, student_id: 101, student_name: '小明', seq: 1,
        status: 'pending', on_leave: true,
      }],
    }) as never)
    const bus = createBus()
    await bus.init()
    await flushPromises()
    vi.mocked(departBusStop).mockResolvedValue(resp({ trip: null, stops: [] }) as never)

    await bus.departStop(bus.stops.value[0] as never)
    await settleDepart()
    await flushPromises()

    expect(departBusStop).toHaveBeenCalledWith(7, 11)
  })
})

describe('usePortalBusTrip — review findings 回歸', () => {
  it('409 接手查詢失敗時只留一個訊息，不與 409 原訊息並存（N1）', async () => {
    // 兩則訊息會指向完全不同的下一步動作（「重新整理」vs「已有進行中的班次」）。
    vi.mocked(startBusTrip).mockRejectedValue(
      axiosError(409, { message: '已有進行中的班次', trip_id: 7 }),
    )
    const bus = createBus()
    await bus.init()
    await flushPromises()
    vi.mocked(getActiveBusTrip).mockRejectedValue(axiosError(500, '伺服器忙碌中'))

    await bus.start()
    await flushPromises()

    expect(bus.startBlockedMessage.value).toBe('伺服器忙碌中')
    expect(bus.startBlockedMessage.value).not.toContain('已有進行中的班次')
  })

  it('接手落空時不得先彈「為您接手」再說開不了（N1）', async () => {
    vi.mocked(startBusTrip).mockRejectedValue(
      axiosError(409, '目前已有 2 輛車在路上，達本校可用車輛數上限（2）'),
    )
    const bus = createBus()
    await bus.init()
    await flushPromises()
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null, stops: null }) as never)

    await bus.start()
    await flushPromises()

    // 沒真的接到就不該說「為您接手」——那是句假話
    expect(ElMessage.warning).not.toHaveBeenCalled()
    expect(bus.startBlockedMessage.value)
      .toBe('目前已有 2 輛車在路上，達本校可用車輛數上限（2）')
  })

  it('真的接到班次時才提示「為您接手」（N1 的另一半不得被改壞）', async () => {
    vi.mocked(startBusTrip).mockRejectedValue(
      axiosError(409, { message: '已有進行中的班次', trip_id: 7 }),
    )
    const bus = createBus()
    await bus.init()
    await flushPromises()
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload()) as never)

    await bus.start()
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalled()
    expect(bus.trip.value?.id).toBe(7)
    expect(bus.startBlockedMessage.value).toBeNull()
  })

  it('重送佇列也套 excused 守衛，不會重送一筆已不該做的離站（N2）', async () => {
    // 司機在隧道按離站 → 進佇列 → 期間家長申報不搭（站轉 excused）→ 恢復連線。
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockRejectedValueOnce(axiosError(undefined))
    await bus.departStop({ stop_id: 11 } as never)
    await settleDepart()
    await flushPromises()
    expect(bus.pendingStopActionCount.value).toBe(1)

    // 期間該站轉 excused（家長申報不搭，後台 WS 推播後 resync 回來的權威狀態）
    bus.stops.value = [{
      stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'excused',
      excuse_reason: 'parent',
    }] as never
    vi.mocked(departBusStop).mockClear()

    // 下一輪自動重送
    await vi.advanceTimersByTimeAsync(PING_FLUSH_INTERVAL_MS)
    await flushPromises()

    expect(departBusStop).not.toHaveBeenCalled()
    // 佇列要清掉，否則會永遠卡著一筆重送不掉的動作
    expect(bus.pendingStopActionCount.value).toBe(0)
  })
})

/**
 * 離站的可取消緩衝期（誤觸防線）。
 *
 * 為什麼是緩衝期而不是確認對話框：後端 `depart_stop` 一收到就對下一站監護人發
 * 「快到提醒」並寫 `notified_at` 擋重發——事後撤銷只還原站點狀態，推播收不回、
 * 真正到站也不會再提醒一次。而離站是每站都按的高頻動作，確認框只會換來反射性
 * 點確認。緩衝期讓「取消」等於那支請求從未發生。
 */
describe('usePortalBusTrip — 離站的可取消緩衝期', () => {
  it('按下離站不立即打 API，只留下待送狀態', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({ stops: [] }) as never)

    await bus.departStop({ stop_id: 11 } as never)

    expect(departBusStop).not.toHaveBeenCalled()
    expect(bus.pendingDepart.value?.stopId).toBe(11)
    // 站點的權威狀態不被樂觀改寫（resync 會整份覆寫 stops，寫進去會被抹掉）
    expect(bus.stops.value.find((s) => s.stop_id === 11)?.status).toBe('pending')
  })

  it('緩衝期倒數歸零後才真的送出', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({
      stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
    }) as never)

    await bus.departStop({ stop_id: 11 } as never)
    await vi.advanceTimersByTimeAsync(DEPART_UNDO_WINDOW_MS - 100)
    expect(departBusStop).not.toHaveBeenCalled()

    await settleDepart()

    expect(departBusStop).toHaveBeenCalledWith(7, 11)
    expect(bus.pendingDepart.value).toBeNull()
    expect(bus.stops.value.map((s) => s.status)).toEqual(['departed'])
  })

  it('倒數期間剩餘毫秒數對外遞減（UI 畫倒數用）', async () => {
    const bus = await bootWithActiveTrip()
    await bus.departStop({ stop_id: 11 } as never)
    expect(bus.pendingDepart.value?.remainingMs).toBe(DEPART_UNDO_WINDOW_MS)

    await vi.advanceTimersByTimeAsync(2000)

    expect(bus.pendingDepart.value?.remainingMs).toBe(DEPART_UNDO_WINDOW_MS - 2000)
  })

  it('取消後完全沒打過 API——推播從未送出，這是本機制的全部意義', async () => {
    const bus = await bootWithActiveTrip()
    await bus.departStop({ stop_id: 11 } as never)

    bus.cancelPendingDepart()
    await settleDepart()

    expect(departBusStop).not.toHaveBeenCalled()
    expect(bus.pendingDepart.value).toBeNull()
    expect(bus.stops.value.find((s) => s.stop_id === 11)?.status).toBe('pending')
  })

  it('取消後計時器不留殘骸（不會在之後某刻突然送出）', async () => {
    const bus = await bootWithActiveTrip()
    await bus.departStop({ stop_id: 11 } as never)
    bus.cancelPendingDepart()

    await vi.advanceTimersByTimeAsync(DEPART_UNDO_WINDOW_MS * 10)
    await flushPromises()

    expect(departBusStop).not.toHaveBeenCalled()
  })

  it('同一站重複點擊不重新計時（顛簸下的連點不該讓它永遠送不出去）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({ stops: [] }) as never)

    await bus.departStop({ stop_id: 11 } as never)
    await vi.advanceTimersByTimeAsync(3000)
    await bus.departStop({ stop_id: 11 } as never)
    // 若連點會重新計時，再推 2 秒不會送出
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()

    expect(departBusStop).toHaveBeenCalledTimes(1)
  })

  it('按下一站的離站會把前一筆立刻送出（兩個各自成立的意圖，後者不吃掉前者）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({ stops: [] }) as never)

    await bus.departStop({ stop_id: 11 } as never)
    await bus.departStop({ stop_id: 12 } as never)

    expect(departBusStop).toHaveBeenCalledWith(7, 11)
    expect(departBusStop).toHaveBeenCalledTimes(1)
    expect(bus.pendingDepart.value?.stopId).toBe(12)

    await settleDepart()
    expect(departBusStop).toHaveBeenCalledWith(7, 12)
  })

  it('離開頁面（teardown）把待送的離站送出，不是丟掉', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({ stops: [] }) as never)
    await bus.departStop({ stop_id: 11 } as never)

    bus.teardown()
    await flushPromises()

    expect(departBusStop).toHaveBeenCalledWith(7, 11)
  })

  it('結束班次前先把待送的離站送出（班次結束後那支離站永遠送不出去）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({ stops: [] }) as never)
    vi.mocked(completeBusTrip).mockResolvedValue(resp(null) as never)
    await bus.departStop({ stop_id: 11 } as never)

    await bus.complete()

    expect(departBusStop).toHaveBeenCalledWith(7, 11)
    const departOrder = vi.mocked(departBusStop).mock.invocationCallOrder[0]
    const completeOrder = vi.mocked(completeBusTrip).mock.invocationCallOrder[0]
    expect(departOrder).toBeLessThan(completeOrder)
  })

  /**
   * 送出前的最終核對必須在 `flushPendingDepart` 內，不能只掛在 `applyActive`：
   * 權威 stops 何時被覆寫不由緩衝期決定（60 秒一輪的 resync 遠慢於 5 秒緩衝，
   * 期間內根本跑不到），唯一保證會在送出前執行的時點就是送出前本身。
   */
  it('緩衝期內該站已被別台裝置處理掉時不送出（送出只會撞 409）', async () => {
    const bus = await bootWithActiveTrip()
    await bus.departStop({ stop_id: 11 } as never)

    // 期間權威狀態更新：11 站已被另一位司機按過離站
    bus.stops.value = [
      { stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' },
    ] as never
    await settleDepart()

    expect(departBusStop).not.toHaveBeenCalled()
    expect(bus.pendingDepart.value).toBeNull()
    expect(ElMessage.info).toHaveBeenCalledWith('此站狀態已由其他裝置更新')
  })

  it('緩衝期內該站轉 excused（家長剛申報不搭）時不送出', async () => {
    const bus = await bootWithActiveTrip()
    await bus.departStop({ stop_id: 11 } as never)

    bus.stops.value = [{
      stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'excused',
      excuse_reason: 'parent',
    }] as never
    await settleDepart()

    expect(departBusStop).not.toHaveBeenCalled()
  })

  it('resync 發現該站已被處理時當場收掉待送（司機不必等到緩衝期結束才知道）', async () => {
    const bus = await bootWithActiveTrip()
    await bus.departStop({ stop_id: 11 } as never)

    // 直接驗證 applyActive 這條路徑上的守衛；真實時間軸上 resync（60 秒）遠慢於
    // 緩衝期（5 秒），這是縱深防禦而非主要防線。
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({
      trip: { id: 7, route_id: 3, direction: 'morning', status: 'in_progress' },
      stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
    }) as never)
    await bus.init()
    await flushPromises()

    expect(bus.pendingDepart.value).toBeNull()
    expect(ElMessage.info).toHaveBeenCalledWith('此站狀態已由其他裝置更新')
  })

  it('班次已消失時不送出待送離站（該班次的端點只會回 404）', async () => {
    const bus = await bootWithActiveTrip()
    await bus.departStop({ stop_id: 11 } as never)

    // 班次消失（排程器逾時關班／被另一台裝置結束）
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp({ trip: null }) as never)
    await vi.advanceTimersByTimeAsync(ACTIVE_TRIP_RESYNC_INTERVAL_MS)
    await flushPromises()

    expect(bus.trip.value).toBeNull()
    expect(bus.pendingDepart.value).toBeNull()
  })

  it('excused 站按離站不排程（縱深防禦，UI 本來就不渲染按鈕）', async () => {
    const bus = await bootWithActiveTrip()
    bus.stops.value = [{
      stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'excused',
      excuse_reason: 'parent',
    }] as never

    await bus.departStop({ stop_id: 11 } as never)

    expect(bus.pendingDepart.value).toBeNull()
    await settleDepart()
    expect(departBusStop).not.toHaveBeenCalled()
  })
})

/**
 * 跳過另加確認框：低頻（一趟頂多一兩次）但後果最重——這孩子今天沒被接到，
 * 且同樣觸發下一站的快到提醒。
 */
describe('usePortalBusTrip — 跳過的確認框', () => {
  it('確認後才打 API，訊息帶學生姓名', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(skipBusStop).mockResolvedValue(resp({ stops: [] }) as never)

    await bus.skipStop({ stop_id: 12 } as never)

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('小華'), '跳過這一站', expect.anything(),
    )
    expect(skipBusStop).toHaveBeenCalledWith(7, 12)
  })

  it('取消確認框就不送出', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))

    await bus.skipStop({ stop_id: 12 } as never)

    expect(skipBusStop).not.toHaveBeenCalled()
  })

  it('取消確認框不影響待送中的離站（它繼續倒數）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({ stops: [] }) as never)
    await bus.departStop({ stop_id: 11 } as never)
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce(new Error('cancel'))

    await bus.skipStop({ stop_id: 12 } as never)

    expect(bus.pendingDepart.value?.stopId).toBe(11)
    await settleDepart()
    expect(departBusStop).toHaveBeenCalledWith(7, 11)
  })

  it('確認跳過前先把待送的離站送出', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({ stops: [] }) as never)
    vi.mocked(skipBusStop).mockResolvedValue(resp({ stops: [] }) as never)
    await bus.departStop({ stop_id: 11 } as never)

    await bus.skipStop({ stop_id: 12 } as never)

    expect(vi.mocked(departBusStop).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(skipBusStop).mock.invocationCallOrder[0])
  })
})

/** 結束班次的確認文案要講出「還有幾站沒處理」——誤觸這顆紅按鈕的成本最高。 */
describe('usePortalBusTrip — 結束班次的確認文案', () => {
  it('尚有未處理站點時，文案帶出站數', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(completeBusTrip).mockResolvedValue(resp(null) as never)

    await bus.complete()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('還有 2 站尚未處理'), '結束班次', expect.anything(),
    )
  })

  it('全部處理完畢時文案講的是另一件事', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(completeBusTrip).mockResolvedValue(resp(null) as never)
    bus.stops.value = [
      { stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' },
      { stop_id: 12, student_id: 102, student_name: '小華', seq: 2, status: 'skipped' },
    ] as never

    await bus.complete()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('所有站點都已處理完畢'), '結束班次', expect.anything(),
    )
  })

  it('excused 站不算「尚未處理」（司機本來就不必對它做任何事）', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(completeBusTrip).mockResolvedValue(resp(null) as never)
    bus.stops.value = [
      { stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' },
      { stop_id: 12, student_id: 102, student_name: '小華', seq: 2, status: 'excused',
        excuse_reason: 'leave' },
    ] as never

    await bus.complete()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('所有站點都已處理完畢'), '結束班次', expect.anything(),
    )
  })
})
