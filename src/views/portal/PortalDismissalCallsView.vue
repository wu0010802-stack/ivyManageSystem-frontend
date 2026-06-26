<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bell, Mute, Refresh, CircleCheck } from '@element-plus/icons-vue'
import {
  getPortalDismissalCalls,
  acknowledgeDismissalCall,
  completeDismissalCall,
} from '@/api/dismissalCalls'
import DismissalCallCard from '@/components/dismissal/DismissalCallCard.vue'
import { closeWebSocketSafely } from '@/utils/ws'
import {
  useNowClock,
  sortByOldestFirst,
  type DismissalCallView,
} from '@/composables/useDismissalUrgency'

type DismissalCall = DismissalCallView

// ─── 狀態 ───────────────────────────────────────────────
const activeCalls = ref<DismissalCall[]>([]) // pending + acknowledged
const loading = ref(false)
// 螢幕報讀宣告：新通知到達時除了 beep/震動/瀏覽器推播，補一則 aria-live 文字，
// 讓關掉聲音或使用報讀器的老師也能即時得知（無障礙對等通知）。
const liveAnnounce = ref('')

// 等候時間活著跳：單一 30s 時鐘 + 最久優先（FIFO）排序的 computed view。
// WS handlers 照舊以 id 變動原始 activeCalls，排序交給 computed，避免在 handler 內手動插入正確位置。
const { now } = useNowClock()
const sortedCalls = computed(() => sortByOldestFirst(activeCalls.value))

// WebSocket 與連線狀態
let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
let wsLivenessTimer: ReturnType<typeof setTimeout> | null = null
const WS_MAX_RETRIES = 5
// 後端每 30s 主動 ping；逾 1.5×（45s）未收到任何訊息即視為半開死連線
// （行動網路切換常見：TCP 半開，onclose/onerror 可能永不觸發），主動踢掉重連避免靜默漏接。
const WS_LIVENESS_TIMEOUT = 45000
const wsConnected = ref(false)
const wsReconnectCount = ref(0)
const wsExhausted = ref(false) // 已達重試上限，fallback 至 polling

// 連線體感狀態：normal / reconnecting / exhausted
const connectionState = computed(() => {
  if (wsConnected.value) return 'normal'
  if (wsExhausted.value) return 'exhausted'
  return 'reconnecting'
})

// ─── 聲音/震動偏好 ──────────────────────────────────────
const SOUND_PREF_KEY = 'portal_dismissal_sound_muted'
const muted = ref(localStorage.getItem(SOUND_PREF_KEY) === '1')
const toggleMute = () => {
  muted.value = !muted.value
  localStorage.setItem(SOUND_PREF_KEY, muted.value ? '1' : '')
  ElMessage.success(muted.value ? '已關閉通知聲音' : '已開啟通知聲音')
}

// 用 Web Audio API 合成短 beep，避免額外音檔依賴
let audioCtx: AudioContext | null = null
const playBeep = () => {
  if (muted.value) return
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume()
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
  } catch { /* ignore audio failure */ }
}

const triggerHaptic = () => {
  if (muted.value) return
  if (navigator.vibrate) navigator.vibrate([180, 80, 180])
}

// 測試聲音：點擊本身就是 user gesture，可解鎖被瀏覽器擋住的 AudioContext，
// 讓老師上工前先確認「真的聽得到」，而不是漏接才發現沒聲音。
const testSound = () => {
  playBeep()
  triggerHaptic()
}

// ─── HTTP 載入 ───────────────────────────────────────────
const fetchCalls = async () => {
  loading.value = true
  try {
    const res = await getPortalDismissalCalls()
    activeCalls.value = res.data || []
  } catch {
    ElMessage.error('載入接送通知失敗')
  } finally {
    loading.value = false
  }
}

// ─── 確認已收到 ──────────────────────────────────────────
const handleAcknowledge = async (call: DismissalCall) => {
  try {
    await acknowledgeDismissalCall(call.id)
    const idx = activeCalls.value.findIndex(c => c.id === call.id)
    if (idx !== -1) activeCalls.value[idx].status = 'acknowledged'
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '操作失敗')
  }
}

// ─── 確認已放學 ──────────────────────────────────────────
// 此操作無法撤銷（後端無 reverse-complete 端點，且家長端會收到放學通知），
// 因此先二次確認再送出。
const handleComplete = async (call: DismissalCall) => {
  try {
    await ElMessageBox.confirm(
      `確定 ${call.student_name}（${call.classroom_name}）已交給家長放學？\n此操作無法撤銷，家長端將收到放學通知。`,
      '確認放學',
      {
        confirmButtonText: '確定放學',
        cancelButtonText: '返回',
        type: 'warning',
      },
    )
  } catch {
    return // 使用者取消
  }
  try {
    await completeDismissalCall(call.id)
    activeCalls.value = activeCalls.value.filter(c => c.id !== call.id)
    ElMessage.success('已標記為放學')
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '操作失敗')
  }
}

// ─── WebSocket ────────────────────────────────────────────
const stopPolling = () => {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null }
}

const startPolling = () => {
  stopPolling()
  pollingTimer = setInterval(fetchCalls, 15000)
}

const clearLiveness = () => {
  if (wsLivenessTimer) { clearTimeout(wsLivenessTimer); wsLivenessTimer = null }
}

// 每收到任何訊息（含後端 ping）就續命；逾時代表連線已半開死亡，主動踢掉重連。
const bumpLiveness = () => {
  clearLiveness()
  wsLivenessTimer = setTimeout(() => {
    if (!ws) return
    // 半開連線的 onclose/onerror 可能永不觸發，先卸掉 handler 避免之後又重複排程重連，
    // 再走與 onclose 相同的重連排程。
    const dead = ws
    dead.onclose = null
    dead.onerror = null
    dead.onmessage = null
    try { dead.close() } catch { /* ignore */ }
    ws = null
    wsConnected.value = false
    scheduleReconnect()
  }, WS_LIVENESS_TIMEOUT)
}

const scheduleReconnect = () => {
  if (wsReconnectCount.value < WS_MAX_RETRIES) {
    const delay = Math.min(1000 * Math.pow(2, wsReconnectCount.value), 30000)
    wsReconnectCount.value++
    wsReconnectTimer = setTimeout(connectWs, delay)
  } else {
    // 超過重試上限，改用 polling，並升級 banner 提醒使用者重新整理
    wsExhausted.value = true
    startPolling()
  }
}

const connectWs = () => {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  // 透過 Vite proxy（/api/ws/*），cookie 由瀏覽器自動攜帶
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/api/ws/portal/dismissal-calls`)

  ws.onopen = () => {
    wsConnected.value = true
    wsReconnectCount.value = 0
    wsExhausted.value = false
    stopPolling()
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
    bumpLiveness()
    // 重連後重新 fetch，補回斷線期間的更新
    fetchCalls()
  }

  ws.onmessage = (e) => {
    bumpLiveness()
    try {
      const event = JSON.parse(e.data)
      // 後端 _recv_loop 等 client 任何訊息回應，90 秒沒收就主動斷線。
      // ping 來時必須回送任意訊息以維持連線存活。
      if (event.type === 'ping') {
        ws?.send(JSON.stringify({ type: 'pong' }))
        return
      }
      handleWsEvent(event)
    } catch { /* ignore */ }
  }

  ws.onerror = () => { wsConnected.value = false }

  ws.onclose = () => {
    wsConnected.value = false
    clearLiveness()
    scheduleReconnect()
  }
}

const reloadPage = () => {
  location.reload()
}

const handleWsEvent = (event: { type: string; payload: DismissalCall }) => {
  const { type, payload } = event
  if (type === 'dismissal_call_created') {
    activeCalls.value.unshift(payload)
    notifyBrowser(payload)
    playBeep()
    triggerHaptic()
    liveAnnounce.value = `新接送通知：${payload.student_name || '學生'}${payload.classroom_name ? `（${payload.classroom_name}）` : ''} 等待接送`
  } else if (type === 'dismissal_call_updated') {
    const idx = activeCalls.value.findIndex(c => c.id === payload.id)
    if (payload.status === 'completed' || payload.status === 'cancelled') {
      if (idx !== -1) activeCalls.value.splice(idx, 1)
    } else {
      if (idx !== -1) activeCalls.value.splice(idx, 1, payload)
      else activeCalls.value.unshift(payload)
    }
  } else if (type === 'dismissal_call_cancelled') {
    activeCalls.value = activeCalls.value.filter(c => c.id !== payload.id)
  }
}

// ─── 瀏覽器推播 ──────────────────────────────────────────
const notifyBrowser = (call: DismissalCall) => {
  if (Notification.permission === 'granted') {
    new Notification('接送通知', {
      body: `${call.student_name}（${call.classroom_name}）等待接送`,
      icon: '/favicon.ico',
    })
  }
}

const requestNotificationPermission = () => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

// ─── Lifecycle ────────────────────────────────────────────
onMounted(async () => {
  requestNotificationPermission()
  await fetchCalls()
  connectWs()
})

onUnmounted(() => {
  // 先卸 handler 再 close，避免 close() 觸發 onclose → scheduleReconnect 在卸載後
  // 建殭屍重連/輪詢（QA 2026-06-04 P2-5）。
  closeWebSocketSafely(ws)
  ws = null
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  clearLiveness()
  stopPolling()
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
})
</script>

<template>
  <div class="portal-dismissal-calls">
    <!-- 無障礙即時宣告：新通知到達時報讀，與 beep/震動/瀏覽器推播對等 -->
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ liveAnnounce }}</p>

    <header class="page-head">
      <h2 class="page-head__title">
        接送通知
        <span v-if="activeCalls.length" class="page-head__count">待接送 {{ activeCalls.length }}</span>
      </h2>
      <div class="page-head__tools">
        <el-tag
          :type="wsConnected ? 'success' : 'warning'"
          size="small"
          effect="light"
          class="conn-tag"
        >
          {{ wsConnected ? '即時接收中' : '連線不穩' }}
        </el-tag>
        <div class="sound-ctl">
          <button
            type="button"
            class="sound-ctl__toggle"
            :class="{ 'is-on': !muted }"
            :aria-pressed="muted ? 'false' : 'true'"
            @click="toggleMute"
          >
            <el-icon><component :is="muted ? Mute : Bell" /></el-icon>
            <span>通知聲音{{ muted ? '關' : '開' }}</span>
          </button>
          <button
            v-if="!muted"
            type="button"
            class="sound-ctl__test"
            @click="testSound"
          >測試</button>
        </div>
      </div>
    </header>

    <!-- 連線狀態 banner（reconnecting 黃 / exhausted 紅）-->
    <div
      v-if="connectionState !== 'normal'"
      class="conn-banner"
      :class="`conn-banner--${connectionState}`"
      role="alert"
    >
      <div class="conn-banner__text">
        <template v-if="connectionState === 'reconnecting'">
          <span>即時連線中斷，正在重新連線</span>
          <span class="conn-banner__sub">第 {{ wsReconnectCount }} / {{ WS_MAX_RETRIES }} 次嘗試</span>
        </template>
        <template v-else>
          <span>即時連線失敗，目前改用備援接收（每 15 秒更新一次）</span>
          <span class="conn-banner__sub">為避免漏接通知，建議重新整理頁面</span>
        </template>
      </div>
      <el-button
        v-if="connectionState === 'exhausted'"
        type="danger"
        size="small"
        :icon="Refresh"
        class="conn-banner__btn"
        @click="reloadPage"
      >重新整理</el-button>
    </div>

    <div class="dismissal-body" v-loading="loading">
      <!-- 正向空狀態：一天大部分時間就是這個畫面 -->
      <div v-if="activeCalls.length === 0 && !loading" class="empty">
        <el-icon class="empty__ico"><CircleCheck /></el-icon>
        <p class="empty__title">目前都接送完畢</p>
        <p class="empty__sub">沒有正在等待的孩子，新的接送通知會即時出現在這裡</p>
      </div>

      <!-- 待處理列表：最久優先 -->
      <TransitionGroup v-else tag="div" name="dcall-list" class="call-list">
        <DismissalCallCard
          v-for="call in sortedCalls"
          :key="call.id"
          :call="call"
          :now="now"
        >
          <template #action>
            <el-button
              v-if="call.status === 'pending'"
              type="primary"
              class="act-btn"
              @click="handleAcknowledge(call)"
            >我收到了</el-button>
            <el-button
              v-else-if="call.status === 'acknowledged'"
              type="success"
              class="act-btn"
              @click="handleComplete(call)"
            >帶出去放學</el-button>
          </template>
        </DismissalCallCard>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.portal-dismissal-calls {
  max-width: 600px;
  margin: 0 auto;
  padding: var(--space-4);
}

/* 螢幕報讀專用，視覺隱藏（portal app 無全域 sr-only，自帶 scoped 版） */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* sticky header：捲動長列表時，連線與聲音狀態恆可見（安全關鍵） */
.page-head {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3) 0;
  margin-bottom: var(--space-3);
  background: var(--bg-color, var(--neutral-50));
}

.page-head__title {
  margin: 0;
  font-size: var(--text-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}
/* 待接送即時計數：老師一眼知道還有幾位待處理 */
.page-head__count {
  display: inline-block;
  margin-left: var(--space-2);
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  vertical-align: middle;
}

.page-head__tools {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* ─── 聲音控制：顯性顯示開/關 + 測試 ─── */
.sound-ctl {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.sound-ctl__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--touch-target-min);
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--surface-color);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
}
.sound-ctl__toggle.is-on {
  border-color: var(--color-success);
  color: #1a7f4b;
  background: var(--color-success-soft);
}
.sound-ctl__toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.sound-ctl__test {
  min-height: var(--touch-target-min);
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}
.sound-ctl__test:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* ─── 連線狀態 banner ─── */
.conn-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
  border: 1px solid transparent;
}
.conn-banner--reconnecting {
  background-color: var(--color-warning-soft);
  color: var(--text-primary);
  border-color: var(--color-warning);
}
.conn-banner--exhausted {
  background-color: var(--color-danger-soft);
  color: var(--text-primary);
  border-color: var(--color-danger);
}
.conn-banner__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
}
.conn-banner__sub {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-weight: var(--font-weight-regular);
}
.conn-banner__btn {
  flex-shrink: 0;
  min-height: var(--touch-target-min);
}

/* ─── 正向空狀態 ─── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-10) var(--space-4);
}
.empty__ico {
  font-size: 48px;
  color: var(--color-success);
  margin-bottom: var(--space-2);
}
.empty__title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}
.empty__sub {
  margin: 0;
  max-width: 32ch;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.6;
}

/* ─── 列表 ─── */
.call-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.act-btn {
  min-height: var(--touch-target-min);
  font-weight: var(--font-weight-semibold);
}

/* 卡片進場 / 移除 / 重排序動畫 */
.dcall-list-enter-active {
  transition:
    opacity 0.24s cubic-bezier(0.25, 1, 0.5, 1),
    transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.dcall-list-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.dcall-list-move {
  transition: transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.dcall-list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.dcall-list-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 560px) {
  .page-head__tools {
    width: 100%;
    justify-content: space-between;
  }
  .act-btn {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dcall-list-enter-active,
  .dcall-list-leave-active,
  .dcall-list-move {
    transition: opacity 0.15s linear;
  }
  .dcall-list-enter-from,
  .dcall-list-leave-to {
    transform: none;
  }
}
</style>
