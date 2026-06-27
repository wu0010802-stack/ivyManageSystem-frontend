import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

// ── mock 依賴 ──
const getCallsMock = vi.fn(() => Promise.resolve({ data: [] }))
vi.mock('@/api/dismissalCalls', () => ({
  getPortalDismissalCalls: () => getCallsMock(),
}))
vi.mock('@/utils/ws', () => ({ closeWebSocketSafely: vi.fn() }))

// ── mock WebSocket ──
let lastWs: MockWS | null = null
class MockWS {
  static OPEN = 1; static CONNECTING = 0; static CLOSED = 3
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  constructor(public url: string) { lastWs = this }
  send(d: string) { this.sent.push(d) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
  emit(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
}

// ── mock AudioContext ──
const oscStub = () => ({ type: '', frequency: { value: 0 }, connect: () => oscStub2(), start: vi.fn(), stop: vi.fn() })
const oscStub2 = () => ({ connect: vi.fn() })
class MockAudioCtx {
  state = 'running'; currentTime = 0
  createOscillator() { return { type: '', frequency: { value: 0 }, connect: () => ({ connect: vi.fn() }), start: vi.fn(), stop: vi.fn() } }
  createGain() { return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() } }
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
  get destination() { return {} }
}

beforeEach(() => {
  getCallsMock.mockClear()
  lastWs = null
  vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket)
  vi.stubGlobal('AudioContext', MockAudioCtx as unknown as typeof AudioContext)
  localStorage.clear()
})
afterEach(async () => {
  const m = await import('@/composables/usePortalDismissalAlerts')
  m.teardownPortalDismissalAlerts()
  // vi.unstubAllGlobals() は setup.js の localStorage mock も除去してしまい
  // 次の beforeEach で localStorage.clear() が TypeError になるため呼ばない。
  // WebSocket / AudioContext は beforeEach で毎回 vi.stubGlobal し直すので
  // afterEach で unstub しなくてもテスト間の隔離は保たれる。
})

describe('usePortalDismissalAlerts', () => {
  it('init 後 fetchCalls 並開一條 WebSocket', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    await nextTick()
    expect(getCallsMock).toHaveBeenCalled()
    expect(lastWs).not.toBeNull()
    expect(lastWs!.url).toContain('/api/ws/portal/dismissal-calls')
  })

  it('init-once：重複 init 只開一條 WebSocket', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    const first = lastWs
    m.initPortalDismissalAlerts()
    expect(lastWs).toBe(first)
  })

  it('dismissal_call_created 事件 → activeCalls 增加 + pendingCount 反映', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    lastWs!.open()
    lastWs!.emit({ type: 'dismissal_call_created', payload: { id: 1, student_name: '小明', classroom_name: '幼幼班', status: 'pending' } })
    const { activeCalls, pendingCount } = m.usePortalDismissalAlerts()
    expect(activeCalls.value.some((c) => c.id === 1)).toBe(true)
    expect(pendingCount.value).toBe(1)
  })

  it('首次 document pointerdown 解鎖 audio（audioUnlocked=true）', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    const { audioUnlocked } = m.usePortalDismissalAlerts()
    expect(audioUnlocked.value).toBe(false)
    document.dispatchEvent(new Event('pointerdown'))
    expect(audioUnlocked.value).toBe(true)
  })

  it('visibilitychange→visible 觸發 fetchCalls 補抓', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    await nextTick()
    getCallsMock.mockClear()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getCallsMock).toHaveBeenCalled()
  })

  it('toggleMute 寫入 localStorage 偏好', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { muted, toggleMute } = m.usePortalDismissalAlerts()
    expect(muted.value).toBe(false)
    toggleMute()
    expect(muted.value).toBe(true)
    expect(localStorage.getItem('portal_dismissal_sound_muted')).toBe('1')
  })
})
