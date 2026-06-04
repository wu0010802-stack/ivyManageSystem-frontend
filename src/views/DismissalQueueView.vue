<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck } from '@element-plus/icons-vue'
import { getDismissalCalls, cancelDismissalCall, createDismissalCall } from '@/api/dismissalCalls'
import { useClassroomStore } from '@/stores/classroom'
import { getStudents } from '@/api/students'
import DismissalCallCard from '@/components/dismissal/DismissalCallCard.vue'
import { closeWebSocketSafely } from '@/utils/ws'
import {
  useNowClock,
  sortByOldestFirst,
  type DismissalCallView,
} from '@/composables/useDismissalUrgency'

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

interface DismissalCall {
  id: number
  student_name: string
  classroom_name: string
  status: string
  requested_at?: string
  requested_by_name?: string
  acknowledged_at?: string
  completed_at?: string
  note?: string
  [key: string]: unknown
}

interface StudentItem {
  id: number
  name: string
  classroom_id: number
  [key: string]: unknown
}

// ─── 狀態 ───────────────────────────────────────────────
const calls = ref<DismissalCall[]>([])
const loading = ref(false)
const classroomStore = useClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)

// 等候時間活著跳 + 最久優先（FIFO）看板排序
const { now } = useNowClock()
const isActiveView = computed(() => filterStatus.value === 'active')
const sortedCalls = computed(() => sortByOldestFirst(calls.value as DismissalCallView[]))

// 篩選
const filterStatus = ref('active') // active=pending+acknowledged | completed | cancelled | all
const filterClassroomId = ref<number | null>(null)

// 建立通知 dialog
const createDialogVisible = ref(false)
const createLoading = ref(false)
const studentList = ref<StudentItem[]>([])
const createForm = ref<{ student_id: number | null; classroom_id: number | null; note: string }>({ student_id: null, classroom_id: null, note: '' })
const createFilterClassroomId = ref(null)

const filteredStudentOptions = computed(() => {
  if (!createFilterClassroomId.value) return studentList.value
  return studentList.value.filter(s => s.classroom_id === createFilterClassroomId.value)
})

const classroomNameMap = computed(() =>
  Object.fromEntries((classrooms.value as { id: number; name: string }[]).map(c => [c.id, c.name]))
)

const studentLabel = (s: StudentItem) => {
  const cName = classroomNameMap.value[s.classroom_id]
  return cName ? `${s.name}（${cName}）` : s.name
}

// WebSocket
let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let wsLivenessTimer: ReturnType<typeof setTimeout> | null = null
let wsReconnectCount = 0
const WS_MAX_RETRIES = 5
// 後端每 30s 主動 ping；逾 1.5×（45s）未收到任何訊息即視為半開死連線
// （TCP 半開時 onclose/onerror 可能永不觸發），主動踢掉重連避免靜默漏接。
const WS_LIVENESS_TIMEOUT = 45000
const wsConnected = ref(false)

// ─── HTTP 載入 ───────────────────────────────────────────
const fetchCalls = async () => {
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (filterClassroomId.value) params.classroom_id = filterClassroomId.value
    if (filterStatus.value !== 'all') {
      // active = pending + acknowledged，後端支援逗號分隔多狀態，一次查詢
      params.status = filterStatus.value === 'active' ? 'pending,acknowledged' : filterStatus.value
    }
    const res = await getDismissalCalls(params)
    calls.value = (res.data || []) as DismissalCall[]
  } catch (e) {
    ElMessage.error('載入接送通知失敗')
  } finally {
    loading.value = false
  }
}

// ─── 取消通知 ────────────────────────────────────────────
const handleCancel = async (call: DismissalCall) => {
  try {
    await ElMessageBox.confirm(
      `確定要取消 ${call.student_name} 的接送通知嗎？`,
      '取消確認',
      { confirmButtonText: '確定取消', cancelButtonText: '返回', type: 'warning' }
    )
    await cancelDismissalCall(call.id)
    ElMessage.success('已取消通知')
    fetchCalls()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || '取消失敗')
  }
}

// ─── 建立通知 ────────────────────────────────────────────
const openCreateDialog = async () => {
  createForm.value = { student_id: null, classroom_id: null, note: '' }
  createFilterClassroomId.value = null
  studentList.value = []
  try {
    const res = await getStudents({ is_active: true, limit: 500 })
    studentList.value = ((res.data as { items?: StudentItem[] }).items || []) as StudentItem[]
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } }; message?: string }
    ElMessage.error('載入學生清單失敗：' + (err.response?.data?.detail || err.message))
  }
  createDialogVisible.value = true
}

// 切換班級篩選時，若已選學生不在該班則清除
watch(createFilterClassroomId, (newVal) => {
  if (!newVal) return
  const selected = studentList.value.find(s => s.id === createForm.value.student_id)
  if (selected && selected.classroom_id !== newVal) {
    createForm.value.student_id = null
    createForm.value.classroom_id = null
  }
})

const onStudentSelect = (studentId: number) => {
  const s = studentList.value.find(s => s.id === studentId)
  if (s) createForm.value.classroom_id = s.classroom_id
}

const submitCreate = async () => {
  if (!createForm.value.student_id || !createForm.value.classroom_id) {
    ElMessage.warning('請選擇學生')
    return
  }
  createLoading.value = true
  try {
    await createDismissalCall({
      student_id: createForm.value.student_id,
      classroom_id: createForm.value.classroom_id,
      note: createForm.value.note || undefined,
    })
    ElMessage.success('接送通知已建立')
    createDialogVisible.value = false
    fetchCalls()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || '建立失敗')
  } finally {
    createLoading.value = false
  }
}

// ─── WebSocket ────────────────────────────────────────────
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
  if (wsReconnectCount < WS_MAX_RETRIES) {
    const delay = Math.min(1000 * Math.pow(2, wsReconnectCount), 30000)
    wsReconnectCount++
    wsReconnectTimer = setTimeout(connectWs, delay)
  }
}

const connectWs = () => {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  // 透過 Vite proxy（/api/ws/*），cookie 由瀏覽器自動攜帶
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/api/ws/admin/dismissal-calls`)

  ws.onopen = () => {
    wsConnected.value = true
    wsReconnectCount = 0
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
    bumpLiveness()
  }

  ws.onmessage = (e) => {
    bumpLiveness()
    try {
      const event = JSON.parse(e.data)
      // 後端 _recv_loop 等 client 任何訊息回應，90 秒沒收就主動斷線。
      // ping 來時必須回送任意訊息以維持連線存活。
      if (event.type === 'ping') {
        ws!.send(JSON.stringify({ type: 'pong' }))
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

const handleWsEvent = (event: { type: string; payload: DismissalCall }) => {
  const { type, payload } = event
  if (type === 'dismissal_call_created') {
    // 若目前顯示 active，prepend
    if (filterStatus.value === 'active' || filterStatus.value === 'all') {
      calls.value.unshift(payload)
    }
  } else if (type === 'dismissal_call_updated') {
    const idx = calls.value.findIndex(c => c.id === payload.id)
    if (idx !== -1) {
      if (filterStatus.value === 'active' && payload.status === 'completed') {
        calls.value.splice(idx, 1)
      } else {
        calls.value.splice(idx, 1, payload)
      }
    }
  } else if (type === 'dismissal_call_cancelled') {
    if (filterStatus.value === 'active') {
      calls.value = calls.value.filter(c => c.id !== payload.id)
    } else {
      const idx = calls.value.findIndex(c => c.id === payload.id)
      if (idx !== -1) calls.value.splice(idx, 1, payload)
    }
  }
}

// ─── 狀態標籤 ────────────────────────────────────────────
const STATUS_LABEL_MAP: Record<string, string> = {
  pending: '待老師確認',
  acknowledged: '老師已收到',
  completed: '已放學',
  cancelled: '已取消',
}
const statusLabel = (status: string) => STATUS_LABEL_MAP[status] || status

const STATUS_TYPE_MAP: Record<string, ElTagType> = {
  pending: 'warning',
  acknowledged: 'primary',
  completed: 'success',
  cancelled: 'info',
}
const statusType = (status: string): ElTagType => STATUS_TYPE_MAP[status]

const formatTime = (dt: string | undefined) => {
  if (!dt) return '-'
  return new Date(dt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

// ─── Lifecycle ────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([fetchCalls(), classroomStore.fetchClassrooms()])
  connectWs()
})

onUnmounted(() => {
  // 先卸 handler 再 close，避免 close() 觸發 onclose → scheduleReconnect 在卸載後
  // 建殭屍重連（QA 2026-06-04 P2-5）。
  closeWebSocketSafely(ws)
  ws = null
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  clearLiveness()
})
</script>

<template>
  <div class="dismissal-queue-view">
    <div class="page-header">
      <h2>接送通知</h2>
      <div class="header-actions">
        <el-tag :type="wsConnected ? 'success' : 'warning'" size="small" effect="light" style="margin-right: 8px">
          {{ wsConnected ? '即時同步中' : '連線中斷' }}
        </el-tag>
        <el-button type="primary" @click="openCreateDialog">建立通知</el-button>
      </div>
    </div>

    <!-- 篩選 -->
    <el-row :gutter="12" class="filter-bar">
      <el-col :xs="24" :sm="8">
        <el-select v-model="filterStatus" placeholder="狀態" clearable @change="fetchCalls" style="width:100%">
          <el-option label="待處理（待確認 + 已收到）" value="active" />
          <el-option label="已放學" value="completed" />
          <el-option label="已取消" value="cancelled" />
          <el-option label="全部" value="all" />
        </el-select>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-select v-model="filterClassroomId" placeholder="全部班級" clearable @change="fetchCalls" style="width:100%">
          <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-col>
      <el-col :xs="24" :sm="4">
        <el-button @click="fetchCalls" :loading="loading">重新整理</el-button>
      </el-col>
    </el-row>

    <!-- 待處理看板：最久優先，等候時間升級色一眼看出哪班老師還沒回應 -->
    <template v-if="isActiveView">
      <div v-if="calls.length === 0 && !loading" class="empty-board">
        <el-icon class="empty-board__ico"><CircleCheck /></el-icon>
        <p class="empty-board__title">目前沒有待處理的接送通知</p>
        <p class="empty-board__sub">家長到場時建立通知，會即時出現在這裡</p>
      </div>
      <div v-else class="board-wrap" v-loading="loading">
        <TransitionGroup tag="div" name="dcall-list" class="board">
          <DismissalCallCard
            v-for="call in sortedCalls"
            :key="call.id"
            :call="call"
            :now="now"
          >
            <template #secondary>
              <span v-if="call.requested_by_name" class="req-by">{{ call.requested_by_name }} 通知</span>
            </template>
            <template #action>
              <el-button
                v-if="call.status === 'pending' || call.status === 'acknowledged'"
                type="danger"
                plain
                size="small"
                @click="handleCancel(call as DismissalCall)"
              >取消通知</el-button>
            </template>
          </DismissalCallCard>
        </TransitionGroup>
      </div>
    </template>

    <!-- 歷史紀錄：已放學 / 已取消 / 全部，走密集表格 -->
    <el-table v-else :data="calls" v-loading="loading" border style="width:100%" class="calls-table">
      <el-table-column label="學生" prop="student_name" width="100" />
      <el-table-column label="班級" prop="classroom_name" width="100" />
      <el-table-column label="狀態" width="120">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="通知時間" width="100">
        <template #default="{ row }">{{ formatTime(row.requested_at) }}</template>
      </el-table-column>
      <el-table-column label="通知人" prop="requested_by_name" width="100" />
      <el-table-column label="確認時間" width="100">
        <template #default="{ row }">{{ formatTime(row.acknowledged_at) }}</template>
      </el-table-column>
      <el-table-column label="放學時間" width="100">
        <template #default="{ row }">{{ formatTime(row.completed_at) }}</template>
      </el-table-column>
      <el-table-column label="備註" prop="note" min-width="120" />
      <el-table-column label="操作" width="110">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'pending' || row.status === 'acknowledged'"
            size="small"
            type="danger"
            plain
            @click="handleCancel(row)"
          >取消通知</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <span class="table-empty">沒有符合條件的紀錄</span>
      </template>
    </el-table>

    <!-- 建立通知 Dialog -->
    <el-dialog v-model="createDialogVisible" title="建立接送通知" width="420px">
      <el-form label-width="80px">
        <el-form-item label="班級篩選">
          <el-select
            v-model="createFilterClassroomId"
            placeholder="全部班級"
            clearable
            style="width:100%"
          >
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學生" required>
          <el-select
            v-model="createForm.student_id"
            placeholder="選擇學生"
            filterable
            style="width:100%"
            @change="onStudentSelect"
          >
            <el-option
              v-for="s in filteredStudentOptions"
              :key="s.id"
              :label="studentLabel(s)"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="createForm.note" placeholder="選填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="submitCreate">建立</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dismissal-queue-view {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.filter-bar {
  margin-bottom: 16px;
}

.calls-table {
  border-radius: 8px;
}

.table-empty {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

/* ─── 待處理看板 ─── */
.board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3);
}

.req-by {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.empty-board {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-1);
  padding: var(--space-10) var(--space-4);
}
.empty-board__ico {
  font-size: 44px;
  color: var(--color-success);
  margin-bottom: var(--space-2);
}
.empty-board__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}
.empty-board__sub {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
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
