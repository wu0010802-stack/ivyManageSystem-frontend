import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'

vi.mock('@/api/bus', () => ({
  startBusTrip: vi.fn(),
  getActiveBusTrip: vi.fn(),
  postBusPings: vi.fn(),
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
  startBusTrip, getActiveBusTrip, postBusPings, departBusStop, skipBusStop,
  undoBusStop, completeBusTrip, listPortalBusRoutes,
} from '@/api/bus'
import {
  usePortalBusTrip, PING_FLUSH_INTERVAL_MS, SUSPECT_TIMESTAMP_STREAK,
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

function routesPayload() {
  return {
    routes: [
      { id: 3, name: 'A 線', is_active: true },
      // 端點理應只回啟用中的路線；保留一筆停用的用來咬住前端那道防禦性過濾
      { id: 4, name: 'B 線（停用）', is_active: false },
    ],
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

  it('進頁一律先問路線，再逐條帶 route_id 查班次（不得做全域查詢）', async () => {
    vi.mocked(listPortalBusRoutes).mockResolvedValue(resp({
      routes: [
        { id: 3, name: 'A 線', is_active: true },
        { id: 5, name: 'C 線', is_active: true },
      ],
    }) as never)
    // 只有 5 號路線有進行中的班次
    vi.mocked(getActiveBusTrip).mockImplementation(((routeId: number | null) =>
      Promise.resolve(routeId === 5 ? resp(tripPayload({ route_id: 5 })) : resp({ trip: null }))
    ) as never)

    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(vi.mocked(getActiveBusTrip).mock.calls).toEqual([[3, null], [5, null]])
    expect(bus.trip.value?.route_id).toBe(5)
  })

  it('找到班次就停止往下查（不再多撈別條路線的名冊）', async () => {
    vi.mocked(listPortalBusRoutes).mockResolvedValue(resp({
      routes: [
        { id: 3, name: 'A 線', is_active: true },
        { id: 5, name: 'C 線', is_active: true },
      ],
    }) as never)
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload()) as never)

    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(vi.mocked(getActiveBusTrip).mock.calls).toEqual([[3, null]])
    expect(bus.trip.value?.id).toBe(7)
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

  it('路線清單失敗時不做全域查詢，直接標記 snapshotFailed', async () => {
    vi.mocked(listPortalBusRoutes).mockRejectedValue(axiosError(500))
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.snapshotFailed.value).toBe(true)
    expect(getActiveBusTrip).not.toHaveBeenCalled()
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('路線清單只保留啟用中的路線，且只留 id/name（不把學生名冊留在前端狀態）', async () => {
    const bus = createBus()
    await bus.init()
    await flushPromises()

    expect(bus.routes.value).toEqual([{ id: 3, name: 'A 線' }])
    expect(JSON.stringify(bus.routes.value)).not.toContain('is_active')
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
    expect(bus.routes.value).toEqual([{ id: 3, name: 'A 線' }])
  })
})

describe('usePortalBusTrip — 開始班次', () => {
  async function bootForStart() {
    const bus = createBus()
    await bus.init()
    await flushPromises()
    return bus
  }

  it('成功開班後套用班次並開始追蹤', async () => {
    vi.mocked(startBusTrip).mockResolvedValue(resp(tripPayload()) as never)
    const bus = await bootForStart()
    bus.direction.value = 'afternoon'
    await bus.start()
    await flushPromises()

    expect(startBusTrip).toHaveBeenCalledWith(3, 'afternoon')
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

  it('409 已有進行中班次：接手時以 route_id + direction 限縮查詢（不得撈到別條路線的名冊）', async () => {
    vi.mocked(startBusTrip).mockRejectedValue(
      axiosError(409, { message: '已有進行中的班次', trip_id: 7 }),
    )
    const bus = await bootForStart() // 進頁時沒有班次，才會走到「選路線 → 開班」
    vi.mocked(getActiveBusTrip).mockResolvedValue(resp(tripPayload()) as never)
    bus.direction.value = 'morning'
    await bus.start()
    await flushPromises()

    expect(getActiveBusTrip).toHaveBeenLastCalledWith(3, 'morning')
    expect(bus.trip.value?.id).toBe(7)
    expect(ElMessage.warning).toHaveBeenCalled()
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
  })

  it('其他錯誤顯示後端訊息且不開始追蹤', async () => {
    vi.mocked(startBusTrip).mockRejectedValue(axiosError(422, '此方向尚未設定站點'))
    const bus = await bootForStart()
    await bus.start()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('此方向尚未設定站點')
    expect(bus.trip.value).toBeNull()
    expect(geolocation.watchPosition).not.toHaveBeenCalled()
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

describe('usePortalBusTrip — 站點操作', () => {
  it('離站成功後以回應的 stops 覆寫', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockResolvedValue(resp({
      stops: [{ stop_id: 11, student_id: 101, student_name: '小明', seq: 1, status: 'departed' }],
    }) as never)

    await bus.departStop(bus.stops.value[0])

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
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('此站已處理')
    expect(getActiveBusTrip).toHaveBeenLastCalledWith(3, 'morning')
    expect(bus.stops.value.map((s) => s.status)).toEqual(['departed'])
    // 重新同步時已在追蹤中，不得再開一組 watch／計時器（舊的會變成無人持有的孤兒）
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
  })

  it('一般錯誤只提示，不重打 active 快照', async () => {
    const bus = await bootWithActiveTrip()
    vi.mocked(departBusStop).mockRejectedValue(axiosError(500))
    const before = vi.mocked(getActiveBusTrip).mock.calls.length

    await bus.departStop({ stop_id: 11 } as never)
    await flushPromises()

    expect(getActiveBusTrip).toHaveBeenCalledTimes(before)
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('操作中的站點 id 對外可見（UI 可鎖按鈕防重複點擊）', async () => {
    const bus = await bootWithActiveTrip()
    let resolveDepart: (v: unknown) => void = () => {}
    vi.mocked(departBusStop).mockReturnValue(new Promise((r) => { resolveDepart = r }) as never)

    const pending = bus.departStop({ stop_id: 11 } as never)
    expect(bus.actingStopId.value).toBe(11)
    // 進行中不接受第二個站點操作（司機在晃動的車上很容易連點）
    await bus.skipStop({ stop_id: 12 } as never)
    expect(skipBusStop).not.toHaveBeenCalled()
    resolveDepart(resp({ stops: [] }))
    await pending
    expect(bus.actingStopId.value).toBeNull()
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
