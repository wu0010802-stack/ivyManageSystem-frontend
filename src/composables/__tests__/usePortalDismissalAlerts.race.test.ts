/**
 * usePortalDismissalAlerts — HTTP 快照 vs WS 增量 的 id-aware merge 回歸測試（A12）
 *
 * Bug：fetchCalls() 原本全量覆蓋 activeCalls（`activeCalls.value = res.data`），與 WS
 * handleWsEvent 的增量 unshift/splice/filter 共用同一 module-singleton。若一個
 * dismissal_call_created WS 事件在 fetchCalls in-flight 期間到達（unshift 進 activeCalls
 * 並已 beep/播報），晚到的 HTTP 快照 resolve 時會把這張剛新增的卡抹除——純 fetch-vs-fetch
 * seq guard 不足，因為 WS created 事件不會 bump fetch seq。
 *
 * 修法：fetchCalls 改 id-aware merge——以 server 快照為權威基準，但保留「在此 fetch 發出
 * 之後才由 WS 加入、快照尚未涵蓋、仍在進行中」的卡；同時尊重 server 端移除/完成，避免
 * onopen resync 時留下 stale 已完成卡。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

// 可控制的 fetch 實作：個別測試可換成 deferred promise 以製造 in-flight 窗口
let getCallsImpl: () => Promise<{ data: unknown[] }> = () => Promise.resolve({ data: [] })
vi.mock('@/api/dismissalCalls', () => ({
  getPortalDismissalCalls: () => getCallsImpl(),
}))
vi.mock('@/utils/ws', () => ({ closeWebSocketSafely: vi.fn() }))

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
  onclose: (() => void) | null = null
  sent: string[] = []
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  send(d: string): void {
    this.sent.push(d)
  }
  close(): void {
    this.readyState = FakeWebSocket.CLOSING
  }
  emit(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }
}

type AlertsModule = typeof import('@/composables/usePortalDismissalAlerts')
let mod: AlertsModule | null = null

async function loadFreshModule(): Promise<AlertsModule> {
  vi.resetModules()
  mod = await import('@/composables/usePortalDismissalAlerts')
  return mod
}

// 讓 microtask 佇列排空（deferred fetch resolve 後，fetchCalls await 之後的合併段才會跑）
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

afterEach(() => {
  mod?.teardownPortalDismissalAlerts()
  mod = null
  getCallsImpl = () => Promise.resolve({ data: [] })
  vi.useRealTimers()
  // 不呼叫 vi.unstubAllGlobals()：會移除 setup.js 對 localStorage 的 mock，導致下一個
  // loadFreshModule() 在模組頂層 localStorage.getItem 拋 TypeError。WebSocket 由每個測試
  // 開頭的 vi.stubGlobal 重設，仍保持隔離。
  FakeWebSocket.instances = []
})

describe('usePortalDismissalAlerts — HTTP 快照 vs WS 增量 merge', () => {
  it('fetchCalls in-flight 期間到達的 created WS 卡，fetch resolve（快照無此卡）後仍保留', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)

    // init 的 fetchCalls 卡在 deferred promise（in-flight），我們稍後手動 resolve
    let resolveFetch: (v: { data: unknown[] }) => void = () => {}
    getCallsImpl = () => new Promise((r) => { resolveFetch = r })

    const { initPortalDismissalAlerts, usePortalDismissalAlerts } = await loadFreshModule()
    const { activeCalls } = usePortalDismissalAlerts()

    initPortalDismissalAlerts() // 發出 fetch #1（in-flight）+ 建 WS（未 open，故不觸發第二次 fetch）
    const socket = FakeWebSocket.instances[0]
    expect(socket).toBeTruthy()

    // in-flight 期間：WS 新增一張接送卡（unshift + beep/播報）
    socket.emit({ type: 'dismissal_call_created', payload: { id: 42, student_name: '小明', classroom_name: '幼幼班', status: 'pending' } })
    expect(activeCalls.value.some((c) => c.id === 42)).toBe(true)

    // 晚到的 HTTP 快照 resolve——不含這張新卡（server 查詢時該卡尚未存在）
    resolveFetch({ data: [{ id: 7, student_name: '舊卡', classroom_name: '大班', status: 'pending' }] })
    await flush()

    // 舊全量覆蓋會抹除 id=42（RED）；id-aware merge 應同時保留新卡與快照卡（GREEN）
    expect(activeCalls.value.some((c) => c.id === 42)).toBe(true)
    expect(activeCalls.value.some((c) => c.id === 7)).toBe(true)
  })

  it('resync：fetch 發出前即存在的卡，若已不在 server 快照中則移除（丟棄斷線期間已完成卡）', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)

    // 第一次 fetch 立即回空
    getCallsImpl = () => Promise.resolve({ data: [] })
    const { initPortalDismissalAlerts, usePortalDismissalAlerts } = await loadFreshModule()
    const { activeCalls, fetchCalls } = usePortalDismissalAlerts()

    initPortalDismissalAlerts()
    await flush() // fetch #1 完成（空）
    const socket = FakeWebSocket.instances[0]

    // WS 於「斷線前」新增一張卡（此刻的 fetch 序號 = 1）
    socket.emit({ type: 'dismissal_call_created', payload: { id: 99, student_name: '小華', classroom_name: '中班', status: 'pending' } })
    expect(activeCalls.value.some((c) => c.id === 99)).toBe(true)

    // 模擬斷線期間 server 已完成該卡：resync fetch（序號 2）回快照不含 id=99
    getCallsImpl = () => Promise.resolve({ data: [] })
    await fetchCalls()

    // 這張卡於 fetch #2 發出【之前】即存在（createdSeq 1 < 2）→ 不保留 → 被移除
    expect(activeCalls.value.some((c) => c.id === 99)).toBe(false)
    expect(activeCalls.value.length).toBe(0)
  })

  it('out-of-order：較舊 fetch 的過時快照不覆蓋較新 fetch 的結果', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)

    // fetch #1 deferred（模擬慢請求）
    let resolveOld: (v: { data: unknown[] }) => void = () => {}
    getCallsImpl = () => new Promise((r) => { resolveOld = r })

    const { initPortalDismissalAlerts, usePortalDismissalAlerts } = await loadFreshModule()
    const { activeCalls, fetchCalls } = usePortalDismissalAlerts()

    initPortalDismissalAlerts() // fetch #1（in-flight）

    // 更新的 fetch #2 先回：帶目前的接送清單
    getCallsImpl = () => Promise.resolve({ data: [{ id: 3, student_name: '新資料', classroom_name: '小班', status: 'pending' }] })
    await fetchCalls()
    expect(activeCalls.value.some((c) => c.id === 3)).toBe(true)

    // 較舊 fetch #1 此刻才回，帶過時（空）快照——不得覆蓋新資料
    resolveOld({ data: [] })
    await flush()
    expect(activeCalls.value.some((c) => c.id === 3)).toBe(true)
  })
})
