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
class MockAudioCtx {
  state = 'running'; currentTime = 0
  createOscillator() { return { type: '', frequency: { value: 0 }, connect: () => ({ connect: vi.fn() }), start: vi.fn(), stop: vi.fn() } }
  createGain() { return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() } }
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
  get destination() { return {} }
}

// ── mock SpeechSynthesis ──
const speakMock = vi.fn()
const cancelMock = vi.fn()
class MockUtterance {
  text = ''
  lang = ''
  volume = 1
  constructor(t?: string) { this.text = t ?? '' }
}

beforeEach(() => {
  getCallsMock.mockClear()
  lastWs = null
  vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket)
  vi.stubGlobal('AudioContext', MockAudioCtx as unknown as typeof AudioContext)
  speakMock.mockClear()
  cancelMock.mockClear()
  vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: cancelMock })
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance as unknown as typeof SpeechSynthesisUtterance)
  localStorage.clear()
})
afterEach(async () => {
  const m = await import('@/composables/usePortalDismissalAlerts')
  m.teardownPortalDismissalAlerts()
  // vi.unstubAllGlobals() 會移除 setup.js 對 localStorage 的 mock，
  // 導致下一個 beforeEach 的 localStorage.clear() 拋 TypeError，故不呼叫。
  // WebSocket / AudioContext 由 beforeEach 的 vi.stubGlobal 每次重設，仍保持測試間隔離。
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

  it('ping → pong：ws.send 送出 {"type":"pong"}', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    lastWs!.open()
    lastWs!.emit({ type: 'ping' })
    expect(lastWs!.sent).toContain(JSON.stringify({ type: 'pong' }))
  })

  it('liveness timeout：45s 無訊息 → ws 被關閉並排程重連', async () => {
    vi.useFakeTimers()
    try {
      const m = await import('@/composables/usePortalDismissalAlerts')
      m.initPortalDismissalAlerts()
      const firstWs = lastWs!
      firstWs.open()
      // 推進 45s，觸發 bumpLiveness callback → dead.close() + scheduleReconnect
      vi.advanceTimersByTime(45000)
      expect(firstWs.readyState).toBe(3)
      // 再推進 backoff（第一次 delay = 1000ms）→ connectWs 建立新 MockWS
      vi.advanceTimersByTime(1000)
      expect(lastWs).not.toBe(firstWs)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ping 重置 liveness：ping 後 30s 不提前觸發 timeout', async () => {
    vi.useFakeTimers()
    try {
      const m = await import('@/composables/usePortalDismissalAlerts')
      m.initPortalDismissalAlerts()
      const firstWs = lastWs!
      firstWs.open()
      // 推進 30s（未到 45s timeout），送 ping → bumpLiveness 重置計時器
      vi.advanceTimersByTime(30000)
      firstWs.emit({ type: 'ping' })
      // 再推進 30s（ping 後僅 30s，距新 timeout 還有 15s）
      vi.advanceTimersByTime(30000)
      // ws 應仍為 OPEN，無新 WebSocket 建立
      expect(firstWs.readyState).toBe(1)
      expect(lastWs).toBe(firstWs)
    } finally {
      vi.useRealTimers()
    }
  })

  it('dismissal_call_updated status=completed → 從 activeCalls 移除', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    lastWs!.open()
    lastWs!.emit({ type: 'dismissal_call_created', payload: { id: 5, student_name: '小美', classroom_name: '大班', status: 'pending' } })
    const { activeCalls } = m.usePortalDismissalAlerts()
    expect(activeCalls.value.some((c) => c.id === 5)).toBe(true)
    lastWs!.emit({ type: 'dismissal_call_updated', payload: { id: 5, student_name: '小美', classroom_name: '大班', status: 'completed' } })
    expect(activeCalls.value.some((c) => c.id === 5)).toBe(false)
  })

  it('dismissal_call_cancelled → 從 activeCalls 移除', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    lastWs!.open()
    lastWs!.emit({ type: 'dismissal_call_created', payload: { id: 7, student_name: '小強', classroom_name: '中班', status: 'pending' } })
    const { activeCalls } = m.usePortalDismissalAlerts()
    expect(activeCalls.value.some((c) => c.id === 7)).toBe(true)
    lastWs!.emit({ type: 'dismissal_call_cancelled', payload: { id: 7 } })
    expect(activeCalls.value.some((c) => c.id === 7)).toBe(false)
  })

  it('speakAnnouncement 唸兩段：zh-TW「班級 名」+ en-US「time to go home」', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })
    expect(speakMock).toHaveBeenCalledTimes(2)
    const first = speakMock.mock.calls[0][0] as { text: string; lang: string }
    const second = speakMock.mock.calls[1][0] as { text: string; lang: string }
    expect(first.text).toBe('幼幼班 小明')
    expect(first.lang).toBe('zh-TW')
    expect(second.text).toBe('time to go home')
    expect(second.lang).toBe('en-US')
  })

  it('speakAnnouncement 班級缺只唸名字；名字也缺唸「學生」', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    speakAnnouncement({ student_name: '小華' })
    expect((speakMock.mock.calls[0][0] as { text: string }).text).toBe('小華')
    speakMock.mockClear()
    speakAnnouncement({})
    expect((speakMock.mock.calls[0][0] as { text: string }).text).toBe('學生')
  })

  it('muted 時 speakAnnouncement 不唸', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement, toggleMute } = m.usePortalDismissalAlerts()
    toggleMute() // muted = true
    speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })
    expect(speakMock).not.toHaveBeenCalled()
  })

  it('speechSynthesis 不存在時 speakAnnouncement 安全 no-op（不 throw）', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    expect(() => speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })).not.toThrow()
    expect(speakMock).not.toHaveBeenCalled()
  })
})
