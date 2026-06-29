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
import { getPortalDismissalCalls } from '@/api/dismissalCalls'
import { closeWebSocketSafely } from '@/utils/ws'
import { sortByOldestFirst, type DismissalCallView } from '@/composables/useDismissalUrgency'

type DismissalCall = DismissalCallView

// ── module-singleton 共享狀態 ──
const activeCalls = ref<DismissalCall[]>([])
const loading = ref(false)
const liveAnnounce = ref('')
const wsConnected = ref(false)
const wsReconnectCount = ref(0)
const wsExhausted = ref(false)
const audioUnlocked = ref(false)
const SOUND_PREF_KEY = 'portal_dismissal_sound_muted'
const muted = ref(localStorage.getItem(SOUND_PREF_KEY) === '1')
const notificationSupported = ref(typeof window !== 'undefined' && 'Notification' in window)

const sortedCalls = computed(() => sortByOldestFirst(activeCalls.value))
const pendingCount = computed(() => activeCalls.value.length)
const connectionState = computed<'normal' | 'reconnecting' | 'exhausted'>(() =>
  wsConnected.value ? 'normal' : wsExhausted.value ? 'exhausted' : 'reconnecting',
)

// ── module-scoped 非響應式 ──
let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
let wsLivenessTimer: ReturnType<typeof setTimeout> | null = null
let audioCtx: AudioContext | null = null
let initialized = false
let gestureHandler: (() => void) | null = null
let visibilityHandler: (() => void) | null = null
const WS_MAX_RETRIES = 5
const WS_LIVENESS_TIMEOUT = 45000

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

function playBeep(): void {
  if (muted.value) return
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0, audioCtx.currentTime)
    gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.4)
  } catch { /* ignore */ }
}

// navigator.vibrate 在所有 iOS（含 iPhone 上的 LINE in-app WebView）為 no-op；
// 僅 Android 有效，不可當 iOS 可靠提醒手段（iOS 主提醒 = beep + 前景視覺）。
function triggerHaptic(): void {
  if (muted.value) return
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([180, 80, 180])
}

function toggleMute(): void {
  muted.value = !muted.value
  localStorage.setItem(SOUND_PREF_KEY, muted.value ? '1' : '')
}

// ── 瀏覽器推播（誠實降級：iOS Safari/LINE WebView 多半不送達，包 try/catch）──
function notifyBrowser(call: DismissalCall): void {
  if (!notificationSupported.value) return
  try {
    if (Notification.permission === 'granted') {
      new Notification('接送通知', {
        body: `${call.student_name}（${call.classroom_name}）等待接送`,
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
async function fetchCalls(): Promise<void> {
  loading.value = true
  try {
    const res = await getPortalDismissalCalls()
    activeCalls.value = res.data || []
  } catch { /* 靜默：UI 由 connectionState 呈現 */ } finally {
    loading.value = false
  }
}

// ── 輪詢 fallback ──
function stopPolling(): void { if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null } }
function startPolling(): void { stopPolling(); pollingTimer = setInterval(fetchCalls, 15000) }

// ── liveness / 重連 ──
function clearLiveness(): void { if (wsLivenessTimer) { clearTimeout(wsLivenessTimer); wsLivenessTimer = null } }
function bumpLiveness(): void {
  clearLiveness()
  wsLivenessTimer = setTimeout(() => {
    if (!ws) return
    const dead = ws
    dead.onclose = null; dead.onerror = null; dead.onmessage = null
    try { dead.close() } catch { /* ignore */ }
    ws = null
    wsConnected.value = false
    scheduleReconnect()
  }, WS_LIVENESS_TIMEOUT)
}
function scheduleReconnect(): void {
  if (wsReconnectCount.value < WS_MAX_RETRIES) {
    const delay = Math.min(1000 * Math.pow(2, wsReconnectCount.value), 30000)
    wsReconnectCount.value++
    wsReconnectTimer = setTimeout(connectWs, delay)
  } else {
    wsExhausted.value = true
    startPolling()
  }
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
    stopPolling()
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
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
  socket.onclose = () => {
    if (ws !== socket) return
    wsConnected.value = false
    clearLiveness()
    scheduleReconnect()
  }
}

function handleWsEvent(event: { type: string; payload: DismissalCall }): void {
  const { type, payload } = event
  if (type === 'dismissal_call_created') {
    activeCalls.value.unshift(payload)
    notifyBrowser(payload)
    playBeep()
    triggerHaptic()
    liveAnnounce.value = `新接送通知：${payload.student_name || '學生'}${payload.classroom_name ? `（${payload.classroom_name}）` : ''} 等待接送`
  } else if (type === 'dismissal_call_updated') {
    const idx = activeCalls.value.findIndex((c) => c.id === payload.id)
    if (payload.status === 'completed' || payload.status === 'cancelled') {
      if (idx !== -1) activeCalls.value.splice(idx, 1)
    } else if (idx !== -1) activeCalls.value.splice(idx, 1, payload)
    else activeCalls.value.unshift(payload)
  } else if (type === 'dismissal_call_cancelled') {
    activeCalls.value = activeCalls.value.filter((c) => c.id !== payload.id)
  }
}

// ── visibilitychange：回前景補抓 + 必要時重連 ──
function onVisibility(): void {
  if (document.visibilityState !== 'visible') return
  fetchCalls()
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // 卸除舊 socket 的 handler 再關閉（與 teardown / bumpLiveness 同 idiom）；否則舊 socket
    // 延遲送達的 onclose 會排程殭屍重連並把替換後的新連線標為斷線。
    closeWebSocketSafely(ws)
    ws = null
    wsReconnectCount.value = 0
    connectWs()
  }
}

export function initPortalDismissalAlerts(): void {
  if (initialized) return
  initialized = true
  requestNotificationPermission()
  // 首次任一手勢解鎖 AudioContext（once + capture，最早攔截）
  gestureHandler = () => { unlockAudio() }
  document.addEventListener('pointerdown', gestureHandler, { once: true, capture: true })
  visibilityHandler = onVisibility
  document.addEventListener('visibilitychange', visibilityHandler)
  fetchCalls()
  connectWs()
}

export function teardownPortalDismissalAlerts(): void {
  closeWebSocketSafely(ws)
  ws = null
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  clearLiveness()
  stopPolling()
  if (gestureHandler) { document.removeEventListener('pointerdown', gestureHandler, { capture: true } as EventListenerOptions); gestureHandler = null }
  if (visibilityHandler) { document.removeEventListener('visibilitychange', visibilityHandler); visibilityHandler = null }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  audioUnlocked.value = false
  wsConnected.value = false
  wsReconnectCount.value = 0
  wsExhausted.value = false
  activeCalls.value = []
  // muted 偏好持久化於 localStorage；重讀當前值（與 toggleMute 寫入保持同步，正常情況為 no-op）
  muted.value = localStorage.getItem(SOUND_PREF_KEY) === '1'
  liveAnnounce.value = ''
  loading.value = false
  initialized = false
}

export function usePortalDismissalAlerts() {
  return {
    activeCalls, sortedCalls, pendingCount, loading, liveAnnounce,
    wsConnected, connectionState, muted, audioUnlocked, notificationSupported,
    toggleMute, unlockAudio, playBeep, triggerHaptic, fetchCalls,
  }
}
