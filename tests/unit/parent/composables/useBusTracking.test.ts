/**
 * useBusTracking — 家長端娃娃車追蹤 composable 單元測試。
 *
 * 涵蓋三類守衛（每一項都做過 mutation 驗證，見 task-9-report）：
 * 1. 快照 vs WS 增量的「過時快照回填」守衛（比照 usePortalDismissalAlerts commit d6e63441）
 * 2. socket identity / 連線恢復（比照 commit 54f481b8）
 * 3. WS close code 分流：4003 走 refresh 重連（不盲目導登入）、4007 停手只提示、
 *    1008 連線數超限不快速重試
 *
 * 時區：本檔以 TZ=UTC 執行，確保 stale 計算真的走 parseTaipeiDate（naive 字串錨定
 * +08:00），而不是靠「跑測試的機器剛好在台北」矇混過關。用 `vi.stubEnv` + `unstubAllEnvs`
 * 而非直接寫 `process.env.TZ`——`process.env` 是 process 全域，vitest 的 isolate 只重置
 * module registry，直接改會讓同 worker 的後續測試檔全部吃到 UTC。
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'

beforeAll(() => { vi.stubEnv('TZ', 'UTC') })
afterAll(() => { vi.unstubAllEnvs() })

// 可切換的 API 實作：個別測試可換成 deferred promise 製造 in-flight 窗口
type BusTodayResp = { data: Record<string, unknown> }
const emptySnapshot = (): BusTodayResp => ({
  data: { trip: null, position: null, stale: false, school: null, children: [] },
})
let getBusTodayImpl: () => Promise<BusTodayResp> = () => Promise.resolve(emptySnapshot())
const getBusTodaySpy = vi.fn(() => getBusTodayImpl())
vi.mock('@/parent/api/bus', () => ({
  getBusToday: () => getBusTodaySpy(),
}))

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []
  url: string
  readyState: number = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((e: { code: number; reason: string }) => void) | null = null
  sent: string[] = []
  closedWith: number | null = null
  listeners: Record<string, Array<() => void>> = {}
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  addEventListener(type: string, handler: () => void): void {
    ;(this.listeners[type] ||= []).push(handler)
  }
  send(d: string): void { this.sent.push(d) }
  close(code?: number): void {
    this.readyState = FakeWebSocket.CLOSED
    this.closedWith = code ?? 1000
  }
  /** 觸發 addEventListener 掛上的 handler（closeWebSocketSafely 卸不掉的那一種） */
  fire(type: string): void {
    ;(this.listeners[type] || []).forEach((h) => { h() })
  }
  /** 模擬 server 端 accept：on* 與 addEventListener 兩種 handler 都會收到 */
  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
    this.fire('open')
  }
  emit(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }
  serverClose(code: number, reason = ''): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason })
    this.fire('close')
  }
}

type BusModule = typeof import('@/parent/composables/useBusTracking')
let mod: BusModule | null = null

async function loadFreshModule(): Promise<BusModule> {
  vi.resetModules()
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
  mod = await import('@/parent/composables/useBusTracking')
  return mod
}

const flush = (): Promise<void> => new Promise((r) => { setTimeout(r, 0) })

/** 一筆完整的今日快照（trip 進行中、一位小孩、有位置） */
function fullSnapshot(overrides: Record<string, unknown> = {}): BusTodayResp {
  return {
    data: {
      trip: { id: 1, direction: 'morning', status: 'in_progress', auto_closed: false, started_at: '2026-07-29T07:20:00' },
      position: { lat: 22.63, lng: 120.3, at: '2026-07-29T07:31:05' },
      stale: false,
      school: { lat: 22.6, lng: 120.29 },
      children: [{
        student_id: 3, student_name: '王小明', stop_status: 'pending',
        stops_ahead: 2, stop_lat: 22.61, stop_lng: 120.28,
      }],
      ...overrides,
    },
  }
}

afterEach(() => {
  mod?.__resetForTest()
  mod = null
  getBusTodayImpl = () => Promise.resolve(emptySnapshot())
  getBusTodaySpy.mockClear()
  FakeWebSocket.instances = []
  vi.useRealTimers()
})

describe('useBusTracking — 初始化與事件套用', () => {
  it('init 先抓快照再開 WS，快照欄位完整落地', async () => {
    getBusTodayImpl = () => Promise.resolve(fullSnapshot())
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()

    await init()

    expect(getBusTodaySpy).toHaveBeenCalledTimes(1)
    expect(state.loading).toBe(false)
    expect(state.trip?.id).toBe(1)
    expect(state.children[0].student_id).toBe(3)
    expect(state.position?.lat).toBe(22.63)
    expect(state.school?.lat).toBe(22.6)
    expect(FakeWebSocket.instances[0].url).toContain('/api/ws/parent/bus')
  })

  it('trip 只保留家長端合約欄位，不吸收 WS 帶來的管理端欄位', async () => {
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    await init()

    // 後端 bus_trip_started 送的是 admin 形狀的 trip_out()（含 route_id / last_lat / last_lng）
    FakeWebSocket.instances[0].emit({
      type: 'bus_trip_started',
      payload: {
        trip: {
          id: 9, route_id: 4, direction: 'morning', trip_date: '2026-07-29',
          status: 'in_progress', auto_closed: false, started_at: '2026-07-29T07:20:00',
          last_ping_at: null, last_lat: 22.63, last_lng: 120.3,
        },
        children: [{ student_id: 3, student_name: '王小明', stop_status: 'pending', stops_ahead: 5 }],
      },
    })

    expect(state.trip?.id).toBe(9)
    expect(state.children[0].stops_ahead).toBe(5)
    expect(Object.keys(state.trip as object).sort())
      .toEqual(['auto_closed', 'direction', 'id', 'started_at', 'status'])
  })

  it('bus_position 更新 position 並清 stale', async () => {
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    await init()
    state.stale = true

    FakeWebSocket.instances[0].emit({
      type: 'bus_position',
      payload: { lat: 22.65, lng: 120.32, at: '2026-07-29T07:32:00' },
    })

    expect(state.position?.lat).toBe(22.65)
    expect(state.stale).toBe(false)
  })

  it('bus_stop_update 覆寫 children；payload 缺 children 時不得清空既有名單', async () => {
    getBusTodayImpl = () => Promise.resolve(fullSnapshot())
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    await init()

    FakeWebSocket.instances[0].emit({
      type: 'bus_stop_update',
      payload: { children: [{ student_id: 3, student_name: '王小明', stop_status: 'departed', stops_ahead: 0 }] },
    })
    expect(state.children[0].stop_status).toBe('departed')

    FakeWebSocket.instances[0].emit({ type: 'bus_stop_update', payload: {} })
    expect(state.children).toHaveLength(1)
    expect(state.children[0].stop_status).toBe('departed')
  })

  it('bus_trip_completed 後 trip 標完成、position 清空、stale 歸 false', async () => {
    getBusTodayImpl = () => Promise.resolve(fullSnapshot({ stale: true }))
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    await init()
    expect(state.stale).toBe(true)

    FakeWebSocket.instances[0].emit({ type: 'bus_trip_completed', payload: { trip_id: 1 } })

    expect(state.trip?.status).toBe('completed')
    expect(state.position).toBe(null)
    expect(state.stale).toBe(false)
  })

  it('bus_trip_completed 帶別班次 trip_id 時不得清掉目前班次（手足分屬不同路線）', async () => {
    getBusTodayImpl = () => Promise.resolve(fullSnapshot())
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    await init()

    FakeWebSocket.instances[0].emit({ type: 'bus_trip_completed', payload: { trip_id: 999 } })

    expect(state.trip?.status).toBe('in_progress')
    expect(state.position?.lat).toBe(22.63)
  })

  it('收到 ping 回送 pong（後端 90 秒無回應會主動斷線）', async () => {
    const { useBusTracking } = await loadFreshModule()
    const { init } = useBusTracking()
    await init()

    FakeWebSocket.instances[0].emit({ type: 'ping' })

    expect(FakeWebSocket.instances[0].sent).toEqual([JSON.stringify({ type: 'pong' })])
  })
})

describe('useBusTracking — 過時快照回填守衛', () => {
  it('in-flight 快照晚回，不得覆蓋期間 WS 已更新的 position / children / trip', async () => {
    // init 的快照卡在 deferred（in-flight）
    let resolveFetch: (v: BusTodayResp) => void = () => {}
    getBusTodayImpl = () => new Promise((r) => { resolveFetch = r })

    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()

    const initPromise = init()
    await flush()
    const socket = FakeWebSocket.instances[0]
    expect(socket).toBeTruthy()

    // in-flight 期間 WS 推來最新進度
    socket.emit({ type: 'bus_position', payload: { lat: 22.70, lng: 120.40, at: '2026-07-29T07:40:00' } })
    socket.emit({
      type: 'bus_stop_update',
      payload: { children: [{ student_id: 3, student_name: '王小明', stop_status: 'departed', stops_ahead: 0 }] },
    })
    socket.emit({ type: 'bus_trip_completed', payload: { trip_id: 1 } })

    // 晚到的舊快照：車還在跑、還沒到站
    resolveFetch(fullSnapshot())
    await initPromise
    await flush()

    expect(state.position).toBe(null)                      // 不得被舊座標復活
    expect(state.children[0].stop_status).toBe('departed') // 不得回退成 pending
    expect(state.trip?.status).toBe('completed')           // 不得復活已結束班次
    expect(state.school?.lat).toBe(22.6)                   // school 為靜態設定，仍應落地
  })

  it('in-flight 期間收到的 bus_position 不得被晚到快照的舊座標覆蓋', async () => {
    let resolveFetch: (v: BusTodayResp) => void = () => {}
    getBusTodayImpl = () => new Promise((r) => { resolveFetch = r })

    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()

    const initPromise = init()
    await flush()
    FakeWebSocket.instances[0].emit({
      type: 'bus_position',
      payload: { lat: 22.70, lng: 120.40, at: '2026-07-29T07:40:00' },
    })

    resolveFetch(fullSnapshot()) // 舊座標 22.63（班次仍在跑，不會觸發 completed 覆寫）
    await initPromise
    await flush()

    expect(state.position?.lat).toBe(22.70)
    expect(state.trip?.status).toBe('in_progress')
  })

  it('out-of-order：較舊 fetch 的過時快照不覆蓋較新 fetch 的結果', async () => {
    let resolveOld: (v: BusTodayResp) => void = () => {}
    getBusTodayImpl = () => new Promise((r) => { resolveOld = r })

    const { useBusTracking } = await loadFreshModule()
    const { state, init, refresh } = useBusTracking()

    const initPromise = init() // fetch #1（in-flight）
    await flush()

    getBusTodayImpl = () => Promise.resolve(fullSnapshot({
      children: [{ student_id: 3, student_name: '王小明', stop_status: 'departed', stops_ahead: 0 }],
    }))
    await refresh() // fetch #2 先回
    expect(state.children[0].stop_status).toBe('departed')

    resolveOld(fullSnapshot()) // fetch #1 此刻才回，帶過時資料
    await initPromise
    await flush()

    expect(state.children[0].stop_status).toBe('departed')
  })

  it('首次快照 in-flight 時，別班次的結束事件不得清掉本班次位置', async () => {
    let resolveFetch: (v: BusTodayResp) => void = () => {}
    getBusTodayImpl = () => new Promise((r) => { resolveFetch = r })

    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()

    const initPromise = init()
    await flush()
    // state.trip 還是 null（快照未回），此時手足所在的另一條路線先到站
    FakeWebSocket.instances[0].emit({ type: 'bus_trip_completed', payload: { trip_id: 999 } })

    resolveFetch(fullSnapshot()) // 本班次 trip_id=1，行駛中且有座標
    await initPromise
    await flush()

    expect(state.trip?.id).toBe(1)
    expect(state.trip?.status).toBe('in_progress')
    expect(state.position?.lat).toBe(22.63)
  })

  it('teardown 後晚到的快照不得回填（登出換帳號）', async () => {
    let resolveFetch: (v: BusTodayResp) => void = () => {}
    getBusTodayImpl = () => new Promise((r) => { resolveFetch = r })

    const { useBusTracking } = await loadFreshModule()
    const { state, init, teardown } = useBusTracking()

    const initPromise = init()
    await flush()
    teardown()

    resolveFetch(fullSnapshot())
    await initPromise
    await flush()

    expect(state.children).toEqual([])
    expect(state.trip).toBe(null)
    expect(state.position).toBe(null)
  })
})

describe('useBusTracking — 連線恢復', () => {
  it('舊 socket 延遲送達的事件不得污染新連線（socket identity 守衛）', async () => {
    const { useBusTracking } = await loadFreshModule()
    const { state, init, retryWs } = useBusTracking()
    await init()

    const first = FakeWebSocket.instances[0]
    first.open()
    await flush()
    expect(state.wsConnected).toBe(true)

    // 先抓住舊 socket 的 handler 參照：真實情境是事件在替換之前就已排入佇列，
    // closeWebSocketSafely 卸掉 handler 後仍會被送達那一份 closure。
    const staleOnClose = first.onclose!
    const staleOnMessage = first.onmessage!

    retryWs() // 主動換連線
    const second = FakeWebSocket.instances[1]
    expect(second).toBeTruthy()
    second.open()
    await flush()
    expect(state.wsConnected).toBe(true)
    const socketCount = FakeWebSocket.instances.length

    // 舊 socket 此刻才吐出 close 與訊息
    staleOnClose({ code: 1006, reason: '' })
    staleOnMessage({ data: JSON.stringify({ type: 'bus_position', payload: { lat: 99.9, lng: 99.9, at: null } }) })

    expect(state.wsConnected).toBe(true)                       // 不得被舊 socket 標成斷線
    expect(state.position).toBe(null)                          // 舊 socket 的事件不得套用
    expect(FakeWebSocket.instances.length).toBe(socketCount)   // 不得多排一次重連
  })

  it('被換掉的舊 socket 不得把全域連線狀態寫成斷線', async () => {
    // registerWs 是用 addEventListener 掛 handler，而 closeWebSocketSafely 只卸 on* 屬性，
    // 卸不掉 listener。沒有 identity 守衛的話，舊 socket 的 close 會在一條健康的新連線上
    // 把 ConnectionBanner 閃成「已斷線」。
    const { useBusTracking } = await loadFreshModule()
    const { useConnectionStatus } = await import('@/parent/composables/useConnectionStatus')
    const { wsConnected: globalWsConnected } = useConnectionStatus()
    const { init, retryWs } = useBusTracking()
    await init()

    const first = FakeWebSocket.instances[0]
    first.open()
    await flush()
    expect(globalWsConnected.value).toBe(true)

    retryWs()
    const second = FakeWebSocket.instances[1]
    second.open()
    await flush()
    expect(globalWsConnected.value).toBe(true)

    // 舊 socket 此刻才吐出 close / error（listener 仍掛著）
    first.fire('close')
    expect(globalWsConnected.value).toBe(true)
    first.fire('error')
    expect(globalWsConnected.value).toBe(true)
  })

  it('teardown 後全域連線狀態交還，舊 socket 不得再把它寫回連線中', async () => {
    const { useBusTracking } = await loadFreshModule()
    const { useConnectionStatus } = await import('@/parent/composables/useConnectionStatus')
    const { wsConnected: globalWsConnected } = useConnectionStatus()
    const { init, teardown } = useBusTracking()
    await init()

    const socket = FakeWebSocket.instances[0]
    socket.open()
    await flush()
    expect(globalWsConnected.value).toBe(true)

    teardown()
    expect(globalWsConnected.value).toBe(false)

    // 已無人擁有的 socket 之後吐出的事件不得再左右全域狀態
    socket.fire('open')
    expect(globalWsConnected.value).toBe(false)
  })

  it('回前景時補抓快照，連線已斷則立刻重連', async () => {
    const { useBusTracking } = await loadFreshModule()
    const { init } = useBusTracking()
    await init()
    FakeWebSocket.instances[0].serverClose(1006)
    const beforeFetch = getBusTodaySpy.mock.calls.length
    const beforeSockets = FakeWebSocket.instances.length

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()

    expect(getBusTodaySpy.mock.calls.length).toBe(beforeFetch + 1)
    expect(FakeWebSocket.instances.length).toBe(beforeSockets + 1)
  })

  it('onopen 後重抓快照，補回斷線期間的變化', async () => {
    const { useBusTracking } = await loadFreshModule()
    const { init } = useBusTracking()
    await init()
    expect(getBusTodaySpy).toHaveBeenCalledTimes(1)

    FakeWebSocket.instances[0].open()
    await flush()

    expect(getBusTodaySpy).toHaveBeenCalledTimes(2)
  })

  it('4003（token 過期）先重抓快照走 axios refresh，再重連，不直接導登入頁', async () => {
    vi.useFakeTimers()
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    const initPromise = init()
    await vi.advanceTimersByTimeAsync(0)
    await initPromise

    const before = getBusTodaySpy.mock.calls.length
    FakeWebSocket.instances[0].serverClose(4003, 'Token 無效或已過期')

    // refresh 用的快照重抓必須發生（axios 攔截器負責 401→refresh→必要時導登入）
    await vi.advanceTimersByTimeAsync(0)
    expect(getBusTodaySpy.mock.calls.length).toBe(before + 1)
    expect(state.lastWsClose?.kind).toBe('auth')

    // 並且仍會重連（token 只是過期、refresh 後 cookie 會更新）
    await vi.advanceTimersByTimeAsync(2000)
    expect(FakeWebSocket.instances.length).toBeGreaterThan(1)
  })

  it('4007（無權限）停止重連只提示，不進入重試迴圈', async () => {
    vi.useFakeTimers()
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    const initPromise = init()
    await vi.advanceTimersByTimeAsync(0)
    await initPromise

    FakeWebSocket.instances[0].serverClose(4007, '此 WS 僅家長端可用')
    await vi.advanceTimersByTimeAsync(120000)

    expect(state.lastWsClose?.kind).toBe('permission')
    expect(state.wsBlocked).toBe(true)
    expect(FakeWebSocket.instances.length).toBe(1) // 沒有任何重連
  })

  it('1008（連線數超限）不快速重試，直接退化為輪詢', async () => {
    vi.useFakeTimers()
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    const initPromise = init()
    await vi.advanceTimersByTimeAsync(0)
    await initPromise

    const before = getBusTodaySpy.mock.calls.length
    FakeWebSocket.instances[0].serverClose(1008, 'ws_connection_limit_exceeded')

    // 指數退避的第一段（1s）內不得有新連線
    await vi.advanceTimersByTimeAsync(5000)
    expect(FakeWebSocket.instances.length).toBe(1)
    expect(state.wsExhausted).toBe(true)

    // 但輪詢要接手
    await vi.advanceTimersByTimeAsync(20000)
    expect(getBusTodaySpy.mock.calls.length).toBeGreaterThan(before)
  })

  it('一般傳輸中斷重試耗盡後退化為輪詢', async () => {
    vi.useFakeTimers()
    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    const initPromise = init()
    await vi.advanceTimersByTimeAsync(0)
    await initPromise

    // 連續 5 次 1006 用盡快速重試額度
    for (let i = 0; i < 6; i++) {
      const s = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
      s.serverClose(1006)
      await vi.advanceTimersByTimeAsync(31000)
    }

    expect(state.wsExhausted).toBe(true)
    const before = getBusTodaySpy.mock.calls.length
    await vi.advanceTimersByTimeAsync(20000)
    expect(getBusTodaySpy.mock.calls.length).toBeGreaterThan(before)
  })
})

describe('useBusTracking — stale 重算', () => {
  it('逾時未更新即標 stale，並以台北時區解析 naive 時間字串', async () => {
    vi.useFakeTimers()
    // 台北 07:33:00 == UTC 2026-07-28T23:33:00Z；position.at 為台北牆鐘 07:31:05（115 秒前）
    vi.setSystemTime(new Date('2026-07-29T07:33:00+08:00'))
    getBusTodayImpl = () => Promise.resolve(fullSnapshot())

    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    const initPromise = init()
    await vi.advanceTimersByTimeAsync(0)
    await initPromise
    expect(state.stale).toBe(false) // 後端當下判定

    await vi.advanceTimersByTimeAsync(11000) // 觸發 stale 重算 tick
    expect(state.stale).toBe(true)
  })

  it('位置仍新鮮時不標 stale', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T07:31:35+08:00')) // 只過了 30 秒
    getBusTodayImpl = () => Promise.resolve(fullSnapshot())

    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    const initPromise = init()
    await vi.advanceTimersByTimeAsync(0)
    await initPromise

    await vi.advanceTimersByTimeAsync(11000)
    expect(state.stale).toBe(false)
  })

  it('班次結束後 stale 一律歸 false（不留在「位置過時」的死狀態）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T07:33:00+08:00'))
    getBusTodayImpl = () => Promise.resolve(fullSnapshot({
      trip: { id: 1, direction: 'morning', status: 'completed', auto_closed: true, started_at: '2026-07-29T07:20:00' },
      stale: true,
    }))

    const { useBusTracking } = await loadFreshModule()
    const { state, init } = useBusTracking()
    const initPromise = init()
    await vi.advanceTimersByTimeAsync(0)
    await initPromise

    await vi.advanceTimersByTimeAsync(11000)
    expect(state.stale).toBe(false)
  })
})

describe('useBusTracking — 隱私', () => {
  it('全流程不得把站點座標寫進 console 或瀏覽器儲存（站點座標＝家庭住址）', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const)
      .map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
    const localSetItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {})
    // happy-dom 的 sessionStorage 是 Proxy，vi.spyOn 對它與 Storage.prototype 都攔不到，
    // 只能整個換掉。不用 vi.unstubAllGlobals() 還原（會連 setup.js 的 localStorage mock
    // 一起移除），改為把原物件 re-stub 回去。
    const realSessionStorage = globalThis.sessionStorage
    const sessionSetItem = vi.fn()
    vi.stubGlobal('sessionStorage', {
      setItem: sessionSetItem,
      getItem: () => null,
      removeItem: () => {},
    })
    getBusTodayImpl = () => Promise.resolve(fullSnapshot())

    try {
      const { useBusTracking } = await loadFreshModule()
      const { init } = useBusTracking()
      await init()
      FakeWebSocket.instances[0].emit({
        type: 'bus_stop_update',
        payload: { children: [{ student_id: 3, stop_status: 'departed', stops_ahead: 0, stop_lat: 22.61, stop_lng: 120.28 }] },
      })
      FakeWebSocket.instances[0].serverClose(1006)

      const printed = [...spies, localSetItem, sessionSetItem]
        .flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join(' ')
      expect(printed).not.toContain('22.61')
      expect(printed).not.toContain('120.28')
      // 座標完全不該落到任何持久化儲存，不只是「沒被寫進值裡」
      expect(localSetItem).not.toHaveBeenCalled()
      expect(sessionSetItem).not.toHaveBeenCalled()
    } finally {
      vi.stubGlobal('sessionStorage', realSessionStorage)
      ;[...spies, localSetItem].forEach((s) => { s.mockRestore() })
    }
  })
})
