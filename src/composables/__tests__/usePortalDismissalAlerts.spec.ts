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
// createOscillator 用 spy 計數，供「三音幼兒園提示音建三個 oscillator」斷言
const createOscillatorSpy = vi.fn(() => ({
  type: '', frequency: { value: 0, setValueAtTime: vi.fn() },
  connect: () => ({ connect: vi.fn() }), start: vi.fn(), stop: vi.fn(),
}))
class MockAudioCtx {
  state = 'running'; currentTime = 0
  createOscillator() { return createOscillatorSpy() }
  createGain() { return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() } }
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
  get destination() { return {} }
}

// ── mock SpeechSynthesis ──
const speakMock = vi.fn()
const cancelMock = vi.fn()
// 預設裝置同時有 zh-TW 與 en-US voice；個別測試可 override 模擬缺 voice / 尚未載入
const DEFAULT_VOICES = [{ name: 'Mei-Jia', lang: 'zh-TW' }, { name: 'Samantha', lang: 'en-US' }]
const getVoicesMock = vi.fn(() => DEFAULT_VOICES)
class MockUtterance {
  text = ''
  lang = ''
  volume = 1
  rate = 1
  voice: unknown = null
  constructor(t?: string) { this.text = t ?? '' }
}

beforeEach(() => {
  getCallsMock.mockClear()
  lastWs = null
  vi.stubGlobal('WebSocket', MockWS as unknown as typeof WebSocket)
  vi.stubGlobal('AudioContext', MockAudioCtx as unknown as typeof AudioContext)
  speakMock.mockClear()
  cancelMock.mockClear()
  createOscillatorSpy.mockClear()
  getVoicesMock.mockClear()
  getVoicesMock.mockImplementation(() => DEFAULT_VOICES)
  vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: cancelMock, getVoices: getVoicesMock })
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance as unknown as typeof SpeechSynthesisUtterance)
  localStorage.clear()
})
afterEach(async () => {
  const m = await import('@/composables/usePortalDismissalAlerts')
  m.teardownPortalDismissalAlerts()
  m.usePortalDismissalAlerts().muted.value = false // 重置 module-singleton muted，避免跨測試洩漏
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

  it('speakAnnouncement 用完整中文廣播，且挑 zh-TW voice', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })
    expect(speakMock).toHaveBeenCalledTimes(1)
    const first = speakMock.mock.calls[0][0] as { text: string; lang: string; voice: { lang: string } }
    expect(first.text).toBe('幼幼班 小明，請準備回家囉')
    expect(first.lang).toBe('zh-TW')
    expect(first.voice.lang).toBe('zh-TW') // 顯式挑中文 voice，不用錯語言嗓子唸中文
  })

  it('speakAnnouncement 班級缺只唸名字；名字也缺唸「學生」', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    speakAnnouncement({ student_name: '小華' })
    expect((speakMock.mock.calls[0][0] as { text: string }).text).toBe('小華，請準備回家囉')
    speakMock.mockClear()
    speakAnnouncement({})
    expect((speakMock.mock.calls[0][0] as { text: string }).text).toBe('學生，請準備回家囉')
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

  it('dismissal_call_created → 三音提示結束後才觸發中文播報（不重疊）', async () => {
    vi.useFakeTimers()
    try {
      const m = await import('@/composables/usePortalDismissalAlerts')
      m.initPortalDismissalAlerts()
      lastWs!.open()
      lastWs!.emit({ type: 'dismissal_call_created', payload: { id: 11, student_name: '小安', classroom_name: '小班', status: 'pending' } })
      // 事件當下：beep 已同步播；語音尚未（先 beep 再唸）
      expect(speakMock).not.toHaveBeenCalled()
      // 550ms 時提示音尚未讓位（避免與播報重疊）
      vi.advanceTimersByTime(550)
      expect(speakMock).not.toHaveBeenCalled()
      // 累計 720ms → 中文播報
      vi.advanceTimersByTime(170)
      expect(speakMock).toHaveBeenCalledTimes(1)
      expect((speakMock.mock.calls[0][0] as { text: string }).text).toBe('小班 小安，請準備回家囉')
    } finally {
      vi.useRealTimers()
    }
  })

  it('首次 pointerdown 同時解鎖 speech（speak 被呼叫一次空白 utterance）', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    m.initPortalDismissalAlerts()
    document.dispatchEvent(new Event('pointerdown'))
    expect(speakMock).toHaveBeenCalledTimes(1)
    expect((speakMock.mock.calls[0][0] as { text: string; volume: number }).text).toBe('')
    expect((speakMock.mock.calls[0][0] as { text: string; volume: number }).volume).toBe(0)
  })

  it('teardown 清待播語音計時器並 cancel（卸載後不發聲）', async () => {
    vi.useFakeTimers()
    try {
      const m = await import('@/composables/usePortalDismissalAlerts')
      m.initPortalDismissalAlerts()
      lastWs!.open()
      lastWs!.emit({ type: 'dismissal_call_created', payload: { id: 99, student_name: '小天', classroom_name: '小班', status: 'pending' } })
      m.teardownPortalDismissalAlerts()
      expect(cancelMock).toHaveBeenCalled()
      vi.advanceTimersByTime(720)
      expect(speakMock).not.toHaveBeenCalled() // 計時器已被 teardown 清掉，等待後不應發聲
    } finally {
      vi.useRealTimers()
    }
  })

  it('無 zh-TW voice 時不使用英文 voice 誤唸中文', async () => {
    getVoicesMock.mockImplementation(() => [{ name: 'Samantha', lang: 'en-US' }])
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })
    expect(speakMock).not.toHaveBeenCalled()
  })

  it('getVoices 尚未載入（空清單）→ 退化播中文但不指定 voice（至少有聲音）', async () => {
    getVoicesMock.mockImplementation(() => [])
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })
    expect(speakMock).toHaveBeenCalledTimes(1)
    expect((speakMock.mock.calls[0][0] as { voice: unknown }).voice).toBeNull()
  })

  it('speakAnnouncement 語速放慢（rate < 1）讓播報更清楚', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { speakAnnouncement } = m.usePortalDismissalAlerts()
    speakAnnouncement({ student_name: '小明', classroom_name: '幼幼班' })
    expect((speakMock.mock.calls[0][0] as { rate: number }).rate).toBeLessThan(1)
  })

  it('playBeep 為柔和的 C5-E5-G5 三音提示：使用三個 triangle oscillator', async () => {
    const m = await import('@/composables/usePortalDismissalAlerts')
    const { playBeep } = m.usePortalDismissalAlerts()
    createOscillatorSpy.mockClear()
    playBeep()
    expect(createOscillatorSpy).toHaveBeenCalledTimes(3)
    const oscillators = createOscillatorSpy.mock.results.map(({ value }) => value as {
      type: string
      frequency: { value: number }
    })
    expect(oscillators.map((osc) => osc.type)).toEqual(['triangle', 'triangle', 'triangle'])
    expect(oscillators.map((osc) => osc.frequency.value)).toEqual([523.25, 659.25, 783.99])
  })

  it('playAlert：提示音同步播、中文語音延遲 720ms（測試按鈕與真實通知共用同一序列）', async () => {
    vi.useFakeTimers()
    try {
      const m = await import('@/composables/usePortalDismissalAlerts')
      const { playAlert } = m.usePortalDismissalAlerts()
      createOscillatorSpy.mockClear()
      playAlert({ student_name: '小明', classroom_name: '小班' })
      expect(createOscillatorSpy).toHaveBeenCalledTimes(3) // 提示音立即（三音）
      expect(speakMock).not.toHaveBeenCalled()             // 語音尚未
      vi.advanceTimersByTime(720)
      expect(speakMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancelPendingSpeech：清待播計時器 + speechSynthesis.cancel（連點測試不堆疊）', async () => {
    vi.useFakeTimers()
    try {
      const m = await import('@/composables/usePortalDismissalAlerts')
      const { playAlert, cancelPendingSpeech } = m.usePortalDismissalAlerts()
      playAlert({ student_name: '小明', classroom_name: '小班' })
      cancelPendingSpeech()
      expect(cancelMock).toHaveBeenCalled()
      vi.advanceTimersByTime(720)
      expect(speakMock).not.toHaveBeenCalled() // 待播計時器已清，不再發聲
    } finally {
      vi.useRealTimers()
    }
  })
})
