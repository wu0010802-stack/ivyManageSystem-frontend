/**
 * usePortalDismissalAlerts — WebSocket 前景重連競態回歸測試
 *
 * 場景（reviewer finding，commit 20288c64）：
 * visibilitychange 回前景時，舊 socket 非 OPEN → onVisibility 會把它替換成新 socket。
 * 若替換時未卸除舊 socket 的 handler，舊 socket「延遲送達」的 onclose 會跑舊閉包，
 * 而閉包讀的是 module 級的 ws / wsConnected / liveness timer（已屬於新連線），於是：
 *   ① 誤把新連線標為斷線（wsConnected=false）
 *   ② 清掉新連線的 liveness timer
 *   ③ 額外排程一次重連
 * 本測試鎖定可由 export 觀測的症狀①：舊 socket 延遲 close 後，新連線狀態不得被污染。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/api/dismissalCalls', () => ({
  getPortalDismissalCalls: vi.fn(() => Promise.resolve({ data: [] })),
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
  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }
  // 模擬瀏覽器延遲送達的 close 事件：onclose 若仍掛著就會觸發
  simulateDelayedClose(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }
}

type AlertsModule = typeof import('@/composables/usePortalDismissalAlerts')
let mod: AlertsModule | null = null

async function loadFreshModule(): Promise<AlertsModule> {
  vi.resetModules()
  mod = await import('@/composables/usePortalDismissalAlerts')
  return mod
}

afterEach(() => {
  mod?.teardownPortalDismissalAlerts()
  mod = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeWebSocket.instances = []
})

describe('usePortalDismissalAlerts — 前景重連競態', () => {
  it('visibility 替換後，舊 socket 延遲 close 不污染新連線狀態', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })

    const { initPortalDismissalAlerts, usePortalDismissalAlerts } = await loadFreshModule()
    const { wsConnected, connectionState } = usePortalDismissalAlerts()

    // init → 建立 socket A 並開啟
    initPortalDismissalAlerts()
    const socketA = FakeWebSocket.instances[0]
    expect(socketA).toBeTruthy()
    socketA.simulateOpen()
    expect(wsConnected.value).toBe(true)

    // iOS 背景凍結：A 進入 CLOSING（半死），但 onclose 尚未送達
    socketA.readyState = FakeWebSocket.CLOSING

    // 回前景 → onVisibility 偵測 A 非 OPEN → 替換為 socket B
    document.dispatchEvent(new Event('visibilitychange'))
    const socketB = FakeWebSocket.instances[1]
    expect(socketB).toBeTruthy()
    expect(socketB).not.toBe(socketA)
    socketB.simulateOpen()
    expect(wsConnected.value).toBe(true)

    // 舊 socket A 的 close 事件此刻才延遲送達
    socketA.simulateDelayedClose()

    // 新連線 B 仍應為正常連線，不得被舊 socket 的 onclose 污染
    expect(wsConnected.value).toBe(true)
    expect(connectionState.value).toBe('normal')
  })
})
