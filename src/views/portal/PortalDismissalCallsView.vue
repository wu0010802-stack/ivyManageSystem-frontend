<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getPortalDismissalCalls,
  acknowledgeDismissalCall,
  completeDismissalCall,
} from '@/api/dismissalCalls'

// ─── 狀態 ───────────────────────────────────────────────
const activeCalls = ref([])   // pending + acknowledged
const historyExpanded = ref(false)
const loading = ref(false)

// WebSocket
let ws = null
let wsReconnectTimer = null
let wsReconnectCount = 0
const WS_MAX_RETRIES = 5
let pollingTimer = null
const wsConnected = ref(false)

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
const handleComplete = async (call) => {
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
    wsReconnectCount = 0
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
    if (wsReconnectCount < WS_MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, wsReconnectCount), 30000)
      wsReconnectCount++
      wsReconnectTimer = setTimeout(connectWs, delay)
    } else {
      // 超過重試上限，改用 polling
      startPolling()
    }
  }
}

const handleWsEvent = (event) => {
  const { type, payload } = event
  if (type === 'dismissal_call_created') {
    // prepend 到列表
    activeCalls.value.unshift(payload)
    // 發出瀏覽器通知（若有權限）
    notifyBrowser(payload)
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
})
</script>

<template>
  <div class="portal-dismissal-calls">
    <div class="page-header">
      <h2>接送通知</h2>
      <el-tag :type="wsConnected ? 'success' : 'warning'" size="small">
        {{ wsConnected ? '即時接收中' : '輪詢模式' }}
      </el-tag>
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
            style="margin-bottom: 8px"
          >
            {{ call.status === 'pending' ? '等待確認' : '已收到' }}
          </el-tag>
          <el-button
            v-if="call.status === 'pending'"
            type="primary"
            size="small"
            @click="handleAcknowledge(call)"
          >已收到</el-button>
          <el-button
            v-if="call.status === 'acknowledged'"
            type="success"
            size="small"
            @click="handleComplete(call)"
          >已放學</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.portal-dismissal-calls {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.empty-state {
  margin-top: 40px;
}

.call-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-left: 4px solid #e4e7ed;
  transition: border-color 0.2s;
}

.call-card.pending {
  border-left-color: #e6a23c;
}

.call-card.acknowledged {
  border-left-color: #409eff;
}

.student-name {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 4px;
}

.classroom-name {
  color: #606266;
  font-size: 0.9rem;
  margin-bottom: 4px;
}

.call-time {
  color: #909399;
  font-size: 0.85rem;
}

.call-note {
  color: #606266;
  font-size: 0.85rem;
  margin-top: 4px;
  font-style: italic;
}

.call-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}
</style>
