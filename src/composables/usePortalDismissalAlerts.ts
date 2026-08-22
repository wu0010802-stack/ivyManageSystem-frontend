/**
 * 教師 Portal 接送即時提醒（module-singleton）。
 *
 * 從 PortalDismissalCallsView 抽出 WS + beep + 通知 + 生命週期，提升到 Portal 殼層全局：
 * - 單一 WS，跨所有 Portal 頁存活（老師多工切頁仍收得到提醒）
 * - AudioContext 在首次 user gesture 解鎖（iOS/LINE WebView 否則 beep 永不響）
 * - visibilitychange 回前景補抓 + 重連（iOS 背景凍結 setTimeout）
 * - 誠實降級：vibrate 僅 Android；Notification 包 try/catch + 偵測支援度
 *
 * 純前端：不依賴後端推播。由 PortalLayout 呼叫 initPortalDismissalAlerts() 一次。
 */
import { ref, computed } from 'vue'
import { getPortalDismissalCalls, completeDismissalCall } from '@/api/dismissalCalls'
import {
  classifyWebSocketClose,
  closeWebSocketSafely,
  WS_LIVENESS_TIMEOUT_MS,
  WS_RECOVERY_RETRY_MS,
  type WebSocketCloseInfo,
} from '@/utils/ws'
import {
  sortActiveQueue,
  isPreArrivalNotice,
  etaDeltaMinutes,
  type DismissalCallView,
} from '@/composables/useDismissalUrgency'
// 多租戶：UI 偏好走 tenantStorage wrapper（單租戶模式 key 與改造前逐字相同，DEV-12）。
import { tenantGetItem, tenantSetItem } from '@/utils/tenantStorage'

type DismissalCall = DismissalCallView

// ── module-singleton 共享狀態 ──
const activeCalls = ref<DismissalCall[]>([])
const loading = ref(false)
const liveAnnounce = ref('')
const wsConnected = ref(false)
const wsReconnectCount = ref(0)
const wsExhausted = ref(false)
const lastWsClose = ref<WebSocketCloseInfo | null>(null)
const audioUnlocked = ref(false)
const SOUND_PREF_KEY = 'portal_dismissal_sound_muted'
const muted = ref(tenantGetItem(SOUND_PREF_KEY) === '1')
const notificationSupported = ref(typeof window !== 'undefined' && 'Notification' in window)

// 與管理端 DismissalQueueView 共用 sortActiveQueue（已抵達優先 → 預告依 ETA）
const sortedCalls = computed(() => sortActiveQueue(activeCalls.value))
const pendingCount = computed(() => activeCalls.value.length)
const connectionState = computed<'normal' | 'reconnecting' | 'exhausted'>(() =>
  wsConnected.value ? 'normal' : wsExhausted.value ? 'exhausted' : 'reconnecting',
)
const connectionMessage = computed(() =>
  lastWsClose.value?.message || '網路可能暫時不穩，系統會自動重連',
)

// ── module-scoped 非響應式 ──
let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let wsRecoveryTimer: ReturnType<typeof setTimeout> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
let wsLivenessTimer: ReturnType<typeof setTimeout> | null = null
let audioCtx: AudioContext | null = null
let initialized = false
// teardown / re-init（例如登出後換帳號）會跨越資料生命週期。單靠 fetchDispatchSeq
// 會因 teardown 歸零而碰撞；generation 不歸零，確保舊帳號晚到快照永遠不能回填。
let lifecycleGeneration = 0
let gestureHandler: (() => void) | null = null
let visibilityHandler: (() => void) | null = null
// fetchCalls 的發出序號（每次呼叫遞增）。用途有二：①丟棄 out-of-order 的過時快照
// ②標記 WS 新增卡是「哪一批 fetch 之後」到達的，供合併時判斷保留與否。
let fetchDispatchSeq = 0
// WS 新增卡的追蹤表：id → 加入當下的 fetchDispatchSeq。fetchCalls 合併時，快照缺席但
// createdSeq >= 該 fetch 序號的卡（＝快照發出後才由 WS 加入）須保留，不可被晚到的快照抹除。
const wsRecentlyCreated = new Map<number, number>()
const WS_MAX_RETRIES = 5
// 三音提示約 0.70s 響完才唸，避免尾音與語音重疊。
const SPEECH_LEAD_MS = 720
// 語速稍慢、音高微亮，讓班級與名字清楚又不顯得生硬。
const SPEECH_RATE = 0.9
const SPEECH_PITCH = 1.04
const speechTimers = new Set<ReturnType<typeof setTimeout>>()

// ── 聲音 / 震動 ──
function unlockAudio(): void {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    // 播一個 0 音量 oscillator，在 user gesture 內解鎖
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    gain.gain.setValueAtTime(0, audioCtx.currentTime)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.01)
    audioUnlocked.value = true
  } catch { /* 解鎖失敗：audioUnlocked 維持 false，UI 顯示提示 */ }
}

// 上行 C 大調三音（C5 → E5 → G5）。以 triangle 波形與低音量短包絡模擬木琴，
// 保留通知辨識度、避開傳統高頻門鈴的尖銳感，適合幼兒園教室／走廊廣播。
const DISMISSAL_CHIME_TONES = [
  { freq: 523.25, at: 0, dur: 0.28 },  // C5
  { freq: 659.25, at: 0.16, dur: 0.28 }, // E5
  { freq: 783.99, at: 0.32, dur: 0.38 }, // G5
]
const CHIME_PEAK_GAIN = 0.12

// 家長預告（尚未抵達）的柔和提示：單音、低音量、無震動無語音。
// 強提醒（三音+震動+語音）保留給「已到門口」與 staff 即時通知。
const SOFT_CHIME_GAIN = 0.06
function playSoftChime(): void {
  if (muted.value) return
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const t0 = audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 523.25 // C5 單音
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(SOFT_CHIME_GAIN, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.32)
  } catch { /* ignore */ }
}

function playBeep(): void {
  if (muted.value) return
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const t0 = audioCtx.currentTime
    for (const tone of DISMISSAL_CHIME_TONES) {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = tone.freq
      const start = t0 + tone.at
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(CHIME_PEAK_GAIN, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + tone.dur)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(start)
      osc.stop(start + tone.dur + 0.02)
    }
  } catch { /* ignore */ }
}

// ── 語音播報（Web Speech API，best-effort；beep 為不支援時的保底）──
function speechSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.speechSynthesis !== 'undefined'
    && typeof window.SpeechSynthesisUtterance === 'function'
}

// iOS Safari 與 AudioContext 同樣需在首次 user gesture 內解鎖 speechSynthesis，
// 否則之後的 speak() 永不發聲。LINE in-app WebView 多半不支援，feature-detect no-op。
function unlockSpeech(): void {
  if (!speechSupported()) return
  try {
    const u = new window.SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
  } catch { /* 解鎖失敗：維持靜默，beep 仍為保底 */ }
}

// 挑指定語言的 voice：優先精確匹配（zh-TW），否則同語系前綴（zh）。
// hasVoices=false 代表 getVoices() 尚未載入（部分瀏覽器首呼回空，需 voiceschanged）。
function pickVoice(exact: string, prefix: string): { hasVoices: boolean; voice: SpeechSynthesisVoice | null } {
  let voices: SpeechSynthesisVoice[] = []
  try { voices = window.speechSynthesis.getVoices?.() || [] } catch { /* ignore */ }
  if (!voices.length) return { hasVoices: false, voice: null }
  const voice = voices.find((v) => v.lang === exact)
    || voices.find((v) => v.lang?.toLowerCase().startsWith(prefix))
    || null
  return { hasVoices: true, voice }
}

// 全中文播報，避免裝置的英文 voice 把學生姓名唸得不自然。
// 班級／名字皆缺時退化為「學生」，與 liveAnnounce fallback 一致；若 voice 清單已載入但
// 沒有中文 voice，寧可只保留提示音，不使用錯語系 voice。清單尚未載入時仍帶 lang 退化播報。
function speakAnnouncement(
  call: { student_name?: string; classroom_name?: string },
  phrase = '，請準備回家囉',
): void {
  if (muted.value) return
  if (!speechSupported()) return
  try {
    const studentLabel = [call.classroom_name, call.student_name].filter(Boolean).join(' ') || '學生'
    const zhPick = pickVoice('zh-TW', 'zh')
    if (!zhPick.hasVoices || zhPick.voice) {
      const zh = new window.SpeechSynthesisUtterance(`${studentLabel}${phrase}`)
      zh.lang = 'zh-TW'
      zh.rate = SPEECH_RATE
      zh.pitch = SPEECH_PITCH
      if (zhPick.voice) zh.voice = zhPick.voice
      window.speechSynthesis.speak(zh)
    }
  } catch { /* ignore：beep 仍為保底 */ }
}

// 統一的「提示音 + 播報」序列：提示音同步先響，SPEECH_LEAD_MS 後才唸（不重疊）。
// 真實通知（handleWsEvent）與測試按鈕（PortalDismissalCallsView.testSound）共用，時序一致。
// phrase：staff/舊流程預設「請準備回家囉」；家長已到門口用「家長已到門口，請準備放學」。
function playAlert(
  call: { student_name?: string; classroom_name?: string },
  phrase?: string,
): void {
  playBeep()
  triggerHaptic()
  const timer = setTimeout(() => { speechTimers.delete(timer); speakAnnouncement(call, phrase) }, SPEECH_LEAD_MS)
  speechTimers.add(timer)
}

// 清掉所有待播語音（待觸發計時器 + 正在唸的佇列）。測試按鈕連點時先清，避免堆疊。
function cancelPendingSpeech(): void {
  speechTimers.forEach(clearTimeout)
  speechTimers.clear()
  try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
}

// navigator.vibrate 在所有 iOS（含 iPhone 上的 LINE in-app WebView）為 no-op；
// 僅 Android 有效，不可當 iOS 可靠提醒手段（iOS 主提醒 = beep + 前景視覺）。
function triggerHaptic(): void {
  if (muted.value) return
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([180, 80, 180])
}

function toggleMute(): void {
  muted.value = !muted.value
  tenantSetItem(SOUND_PREF_KEY, muted.value ? '1' : '')
}

// ── 瀏覽器推播（誠實降級：iOS Safari/LINE WebView 多半不送達，包 try/catch）──
function notifyBrowser(call: DismissalCall, body?: string): void {
  if (!notificationSupported.value) return
  try {
    if (Notification.permission === 'granted') {
      new Notification('接送通知', {
        body: body || `${call.student_name}（${call.classroom_name}）等待接送`,
        icon: '/favicon.ico',
      })
    }
  } catch { /* 部分 WebView 對 new Notification 直接 throw */ }
}

function requestNotificationPermission(): void {
  if (notificationSupported.value && Notification.permission === 'default') {
    try { Notification.requestPermission() } catch { /* ignore */ }
  }
}

// ── HTTP ──
function isActiveStatus(status?: string): boolean {
  return status !== 'completed' && status !== 'cancelled'
}

// 教師端不再有「帶出去放學」按鈕：老師按「我收到了」時若家長預告尚未抵達，
// 通知先停在 acknowledged；家長此刻抵達門口（dismissal_call_arrived）才補一刀
// 自動完成放學，教師不需再操作第二次。422/網路錯誤靜默吞掉——多半是已被
// 其他路徑完成，稍後 dismissal_call_updated 廣播到達時狀態仍會正確收斂。
async function autoCompleteOnArrival(callId: number): Promise<void> {
  try {
    await completeDismissalCall(callId)
    const idx = activeCalls.value.findIndex((c) => c.id === callId)
    if (idx !== -1) activeCalls.value.splice(idx, 1)
    wsRecentlyCreated.delete(callId)
  } catch { /* ignore：見上方註解 */ }
}

// server 快照為權威基準，但【保留】在此 fetch 發出之後才由 WS 加入、快照尚未涵蓋、且仍在
// 進行中的接送卡——否則晚到的 HTTP 快照會抹除剛由 WS 新增/播報過的卡（純 fetch-vs-fetch
// seq guard 不足，因 WS created 事件不會 bump fetch seq）。反之，快照缺席但於 fetch 發出
// 【之前】即存在的卡（createdSeq < mySeq，或非 WS 新增）代表 server 端已移除/完成，予以丟棄，
// 維持 onopen resync「丟棄斷線期間已完成卡」的語意。
function mergeSnapshotWithLiveCalls(snapshot: DismissalCall[], mySeq: number): DismissalCall[] {
  const snapshotIds = new Set(snapshot.map((c) => c.id))
  const preserved = activeCalls.value.filter((c) => {
    if (snapshotIds.has(c.id)) return false
    const createdSeq = wsRecentlyCreated.get(c.id)
    return createdSeq !== undefined && createdSeq >= mySeq && isActiveStatus(c.status)
  })
  // 收斂追蹤表：已被 server 快照確認、或早於本次 fetch 而未獲保留的卡不再需要特別追蹤。
  for (const [id, seq] of wsRecentlyCreated) {
    if (snapshotIds.has(id) || seq < mySeq) wsRecentlyCreated.delete(id)
  }
  return [...preserved, ...snapshot]
}

async function fetchCalls(): Promise<void> {
  const mySeq = ++fetchDispatchSeq
  const myGeneration = lifecycleGeneration
  loading.value = true
  try {
    const res = await getPortalDismissalCalls()
    // 已有更新的 fetch 發出 → 丟棄這個過時快照（避免 out-of-order 覆蓋新資料）
    if (myGeneration !== lifecycleGeneration || mySeq !== fetchDispatchSeq) return
    activeCalls.value = mergeSnapshotWithLiveCalls(res.data || [], mySeq)
  } catch { /* 靜默：UI 由 connectionState 呈現 */ } finally {
    if (myGeneration === lifecycleGeneration && mySeq === fetchDispatchSeq) {
      loading.value = false
    }
  }
}

// ── 輪詢 fallback ──
function stopPolling(): void { if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null } }
function startPolling(): void { stopPolling(); pollingTimer = setInterval(fetchCalls, 15000) }

// ── liveness / 重連 ──
function clearLiveness(): void { if (wsLivenessTimer) { clearTimeout(wsLivenessTimer); wsLivenessTimer = null } }
function bumpLiveness(): void {
  clearLiveness()
  if (document.visibilityState === 'hidden') return
  wsLivenessTimer = setTimeout(() => {
    if (!ws) return
    const dead = ws
    dead.onclose = null; dead.onerror = null; dead.onmessage = null
    try { dead.close() } catch { /* ignore */ }
    ws = null
    wsConnected.value = false
    lastWsClose.value = classifyWebSocketClose({ code: 1006, reason: '' })
    scheduleReconnect()
  }, WS_LIVENESS_TIMEOUT_MS)
}
function scheduleReconnect(): void {
  if (wsReconnectCount.value < WS_MAX_RETRIES) {
    const delay = Math.min(1000 * Math.pow(2, wsReconnectCount.value), 30000)
    wsReconnectCount.value++
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
    wsReconnectTimer = setTimeout(connectWs, delay)
  } else {
    wsExhausted.value = true
    startPolling()
    if (!wsRecoveryTimer) {
      wsRecoveryTimer = setTimeout(() => {
        wsRecoveryTimer = null
        connectWs()
      }, WS_RECOVERY_RETRY_MS)
    }
  }
}
function retryWebSocket(): void {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  if (wsRecoveryTimer) { clearTimeout(wsRecoveryTimer); wsRecoveryTimer = null }
  closeWebSocketSafely(ws)
  ws = null
  wsReconnectCount.value = 0
  wsExhausted.value = false
  connectWs()
}
function connectWs(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  // 以 socket instance identity 守衛所有 handler：若此 socket 已非當前 ws（被 visibilitychange
  // 替換或 liveness 重連換掉），舊 socket 延遲送達的事件一律忽略，避免污染新連線狀態
  // （誤標斷線 / 清掉新 liveness timer / 多排一次重連）。
  const socket = new WebSocket(`${proto}://${location.host}/api/ws/portal/dismissal-calls`)
  ws = socket
  socket.onopen = () => {
    if (ws !== socket) return
    wsConnected.value = true
    wsReconnectCount.value = 0
    wsExhausted.value = false
    lastWsClose.value = null
    stopPolling()
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
    if (wsRecoveryTimer) { clearTimeout(wsRecoveryTimer); wsRecoveryTimer = null }
    bumpLiveness()
    fetchCalls()
  }
  socket.onmessage = (e) => {
    if (ws !== socket) return
    bumpLiveness()
    try {
      const event = JSON.parse(e.data)
      if (event.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return }
      handleWsEvent(event)
    } catch { /* ignore */ }
  }
  socket.onerror = () => { if (ws !== socket) return; wsConnected.value = false }
  socket.onclose = (event) => {
    if (ws !== socket) return
    ws = null
    wsConnected.value = false
    lastWsClose.value = classifyWebSocketClose(event)
    clearLiveness()
    scheduleReconnect()
  }
}

function handleWsEvent(event: { type: string; payload: DismissalCall }): void {
  const { type, payload } = event
  if (type === 'dismissal_call_created') {
    // idempotent：重複 created（重連補送 / echo）以 id 去重，只更新內容、不重播提醒
    const dupIdx = activeCalls.value.findIndex((c) => c.id === payload.id)
    if (dupIdx !== -1) {
      activeCalls.value.splice(dupIdx, 1, payload)
      return
    }
    activeCalls.value.unshift(payload)
    // 記錄「加入當下的 fetch 序號」，讓 in-flight fetch 的晚到快照不會把這張新卡抹除。
    wsRecentlyCreated.set(payload.id, fetchDispatchSeq)
    if (isPreArrivalNotice(payload)) {
      // 家長預告（尚未抵達）：柔和提示——單音 + 視覺插卡 + 報讀，
      // 不震動、不語音；強提醒保留給 dismissal_call_arrived。
      playSoftChime()
      const eta = etaDeltaMinutes(payload.expected_arrival_at, Date.now())
      const etaText = eta != null && eta > 0 ? `預計 ${eta} 分鐘後抵達` : '即將抵達'
      const line = `${payload.student_name || '學生'}家長${etaText}`
      notifyBrowser(payload, `${line}（${payload.classroom_name || ''}）`)
      liveAnnounce.value = `預告接送：${line}`
    } else {
      notifyBrowser(payload)
      playAlert(payload)
      liveAnnounce.value = `新接送通知：${payload.student_name || '學生'}${payload.classroom_name ? `（${payload.classroom_name}）` : ''} 等待接送`
    }
  } else if (type === 'dismissal_call_arrived') {
    // 家長/辦公室標記「已到門口」：此刻才觸發較強的音效、震動與語音。
    const idx = activeCalls.value.findIndex((c) => c.id === payload.id)
    const wasArrived = idx !== -1 && !!activeCalls.value[idx].arrived_at
    if (idx !== -1) activeCalls.value.splice(idx, 1, payload)
    else { activeCalls.value.unshift(payload); wsRecentlyCreated.set(payload.id, fetchDispatchSeq) }
    if (!wasArrived) {
      // 重複 arrived 事件不重播（idempotent）
      notifyBrowser(payload, `${payload.student_name || '學生'}家長已到門口，請準備放學`)
      playAlert(payload, '家長已到門口，請準備放學')
      liveAnnounce.value = `${payload.student_name || '學生'}家長已到門口，請準備放學`
    }
    // 教師已按過「我收到了」（acknowledged）且家長此刻才抵達：自動完成放學。
    if (payload.status === 'acknowledged') {
      autoCompleteOnArrival(payload.id)
    }
  } else if (type === 'dismissal_call_updated') {
    const idx = activeCalls.value.findIndex((c) => c.id === payload.id)
    if (payload.status === 'completed' || payload.status === 'cancelled') {
      if (idx !== -1) activeCalls.value.splice(idx, 1)
      wsRecentlyCreated.delete(payload.id)
    } else if (idx !== -1) activeCalls.value.splice(idx, 1, payload)
    else { activeCalls.value.unshift(payload); wsRecentlyCreated.set(payload.id, fetchDispatchSeq) }
  } else if (type === 'dismissal_call_cancelled') {
    activeCalls.value = activeCalls.value.filter((c) => c.id !== payload.id)
    wsRecentlyCreated.delete(payload.id)
  }
}

// ── visibilitychange：回前景補抓 + 必要時重連 ──
function onVisibility(): void {
  if (document.visibilityState !== 'visible') {
    clearLiveness()
    return
  }
  fetchCalls()
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // 卸除舊 socket 的 handler 再關閉（與 teardown / bumpLiveness 同 idiom）；否則舊 socket
    // 延遲送達的 onclose 會排程殭屍重連並把替換後的新連線標為斷線。
    retryWebSocket()
  } else {
    bumpLiveness()
  }
}

export function initPortalDismissalAlerts(): void {
  if (initialized) return
  initialized = true
  lifecycleGeneration++
  requestNotificationPermission()
  // 首次任一手勢解鎖 AudioContext（once + capture，最早攔截）
  gestureHandler = () => { unlockAudio(); unlockSpeech() }
  document.addEventListener('pointerdown', gestureHandler, { once: true, capture: true })
  visibilityHandler = onVisibility
  document.addEventListener('visibilitychange', visibilityHandler)
  fetchCalls()
  connectWs()
}

export function teardownPortalDismissalAlerts(): void {
  // 先切斷資料生命週期，讓任何仍在 flight 的舊帳號快照失效。
  lifecycleGeneration++
  closeWebSocketSafely(ws)
  ws = null
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  if (wsRecoveryTimer) { clearTimeout(wsRecoveryTimer); wsRecoveryTimer = null }
  clearLiveness()
  cancelPendingSpeech()
  stopPolling()
  if (gestureHandler) { document.removeEventListener('pointerdown', gestureHandler, { capture: true } as EventListenerOptions); gestureHandler = null }
  if (visibilityHandler) { document.removeEventListener('visibilitychange', visibilityHandler); visibilityHandler = null }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  audioUnlocked.value = false
  wsConnected.value = false
  wsReconnectCount.value = 0
  wsExhausted.value = false
  lastWsClose.value = null
  activeCalls.value = []
  wsRecentlyCreated.clear()
  fetchDispatchSeq = 0
  // muted 偏好持久化於 localStorage；重讀當前值（與 toggleMute 寫入保持同步，正常情況為 no-op）
  muted.value = tenantGetItem(SOUND_PREF_KEY) === '1'
  liveAnnounce.value = ''
  loading.value = false
  initialized = false
}

export function usePortalDismissalAlerts() {
  return {
    activeCalls, sortedCalls, pendingCount, loading, liveAnnounce,
    wsConnected, connectionState, lastWsClose, connectionMessage,
    muted, audioUnlocked, notificationSupported,
    toggleMute, unlockAudio, unlockSpeech, playBeep, speakAnnouncement, playAlert, cancelPendingSpeech, triggerHaptic, fetchCalls,
    retryWebSocket,
  }
}
