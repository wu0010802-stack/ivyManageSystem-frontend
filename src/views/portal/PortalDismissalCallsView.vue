<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Bell, Mute, Refresh } from '@element-plus/icons-vue'
import {
  getPortalDismissalCalls,
  acknowledgeDismissalCall,
  completeDismissalCall,
} from '@/api/dismissalCalls'

// ─── 狀態 ───────────────────────────────────────────────
const activeCalls = ref([])   // pending + acknowledged
const loading = ref(false)

// WebSocket 與連線狀態
let ws = null
let wsReconnectTimer = null
let pollingTimer = null
const WS_MAX_RETRIES = 5
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
  ElMessage.success(muted.value ? '已靜音通知聲音' : '已開啟通知聲音')
}

// 用 Web Audio API 合成短 beep，避免額外音檔依賴
let audioCtx = null
const playBeep = () => {
  if (muted.value) return
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
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
const handleAcknowledge = async (call) => {
  try {
    await acknowledgeDismissalCall(call.id)
    const idx = activeCalls.value.findIndex(c => c.id === call.id)
    if (idx !== -1) activeCalls.value[idx].status = 'acknowledged'
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '操作失敗')
  }
}

// ─── 確認已放學 ──────────────────────────────────────────
// 此操作無法撤銷（後端無 reverse-complete 端點，且家長端會收到放學通知），
// 因此先二次確認再送出。
const handleComplete = async (call) => {
  try {
    await ElMessageBox.confirm(
      `確定 ${call.student_name}（${call.classroom_name}）已交給家長放學？\n此操作無法撤銷，家長端將收到放學通知。`,
      '確認放學',
      {
        confirmButtonText: '確定放學',
        cancelButtonText: '取消',
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
    ElMessage.error(e.response?.data?.detail || '操作失敗')
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
    // 重連後重新 fetch，補回斷線期間的更新
    fetchCalls()
  }

  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data)
      handleWsEvent(event)
    } catch { /* ignore */ }
  }

  ws.onerror = () => { wsConnected.value = false }

  ws.onclose = () => {
    wsConnected.value = false
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
}

const reloadPage = () => {
  location.reload()
}

const handleWsEvent = (event) => {
  const { type, payload } = event
  if (type === 'dismissal_call_created') {
    activeCalls.value.unshift(payload)
    notifyBrowser(payload)
    playBeep()
    triggerHaptic()
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
const notifyBrowser = (call) => {
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

// ─── 工具函式 ────────────────────────────────────────────
const formatTime = (dt) => {
  if (!dt) return '-'
  const d = new Date(dt)
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

// ─── Lifecycle ────────────────────────────────────────────
onMounted(async () => {
  requestNotificationPermission()
  await fetchCalls()
  connectWs()
})

onUnmounted(() => {
  if (ws) ws.close()
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
  stopPolling()
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
})
</script>

<template>
  <div class="portal-dismissal-calls">
    <el-card class="header-card">
      <div class="sheet-header">
        <h2>接送通知</h2>
        <div class="header-actions">
          <el-tag
            :type="wsConnected ? 'success' : 'warning'"
            size="small"
            class="conn-tag"
          >
            {{ wsConnected ? '即時接收中' : '輪詢模式' }}
          </el-tag>
          <el-button
            :icon="muted ? Mute : Bell"
            circle
            class="mute-btn"
            :aria-label="muted ? '開啟通知聲音' : '靜音通知聲音'"
            :title="muted ? '開啟通知聲音' : '靜音通知聲音'"
            @click="toggleMute"
          />
        </div>
      </div>
    </el-card>

    <!-- 連線狀態 banner（reconnecting 黃 / exhausted 紅）-->
    <div
      v-if="connectionState !== 'normal'"
      class="conn-banner"
      :class="`conn-banner--${connectionState}`"
      role="alert"
    >
      <div class="conn-banner__text">
        <template v-if="connectionState === 'reconnecting'">
          <span>即時連線中斷，正在重連…</span>
          <span class="conn-banner__sub">第 {{ wsReconnectCount }} / {{ WS_MAX_RETRIES }} 次嘗試</span>
        </template>
        <template v-else>
          <span>即時連線失敗，目前每 15 秒輪詢一次。</span>
          <span class="conn-banner__sub">為避免漏接通知，請重新整理頁面。</span>
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

    <div v-loading="loading">
      <!-- 待處理列表 -->
      <div v-if="activeCalls.length === 0" class="empty-state">
        <el-empty description="目前沒有待處理的接送通知" />
      </div>

      <div v-for="call in activeCalls" :key="call.id" class="call-card" :class="call.status">
        <div class="call-info">
          <div class="student-name">{{ call.student_name }}</div>
          <div class="classroom-name">{{ call.classroom_name }}</div>
          <div class="call-time">通知時間：{{ formatTime(call.requested_at) }}</div>
          <div v-if="call.note" class="call-note">備註：{{ call.note }}</div>
        </div>
        <div class="call-actions">
          <el-tag
            :type="call.status === 'pending' ? 'warning' : 'primary'"
            size="small"
            class="call-actions__status"
          >
            {{ call.status === 'pending' ? '等待確認' : '已收到' }}
          </el-tag>
          <el-button
            v-if="call.status === 'pending'"
            type="primary"
            class="call-actions__btn"
            @click="handleAcknowledge(call)"
          >已收到</el-button>
          <el-button
            v-if="call.status === 'acknowledged'"
            type="success"
            size="large"
            class="call-actions__btn call-actions__btn--primary"
            @click="handleComplete(call)"
          >已放學</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.portal-dismissal-calls {
  max-width: 600px;
  margin: 0 auto;
  padding: var(--space-4);
}

.header-card {
  margin-bottom: var(--space-4);
  background-color: var(--surface-color);
}

.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.sheet-header h2 {
  margin: 0;
  font-size: var(--text-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.mute-btn {
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
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
}

.empty-state {
  margin-top: var(--space-10);
}

.call-card {
  background: var(--surface-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  border-left: 4px solid var(--border-color);
  transition: border-color var(--transition-fast);
}

.call-card.pending {
  border-left-color: var(--color-warning);
}

.call-card.acknowledged {
  border-left-color: var(--color-info);
}

.student-name {
  font-size: var(--text-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.classroom-name {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  margin-bottom: var(--space-1);
}

.call-time {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}

.call-note {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  margin-top: var(--space-1);
  font-style: italic;
}

.call-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
  flex-shrink: 0;
  min-width: 110px;
}

.call-actions__status {
  align-self: flex-end;
}

.call-actions__btn {
  min-height: var(--touch-target-min);
}

.call-actions__btn--primary {
  font-weight: var(--font-weight-semibold);
}

@media (max-width: 480px) {
  .call-card {
    flex-direction: column;
    align-items: stretch;
  }
  .call-actions {
    min-width: 0;
  }
  .call-actions__status {
    align-self: flex-start;
  }
}
</style>
