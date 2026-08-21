<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { getDismissalCalls, cancelDismissalCall, createDismissalCall } from '@/api/dismissalCalls'
import { getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'
import DismissalPosBoard from '@/components/dismissal/pos/DismissalPosBoard.vue'
import {
  classifyWebSocketClose,
  closeWebSocketSafely,
  WS_LIVENESS_TIMEOUT_MS,
  WS_RECOVERY_RETRY_MS,
  type WebSocketCloseInfo,
} from '@/utils/ws'
import { formatTaipeiClock } from '@/utils/taipeiTime'
import PageHeader from '@/components/common/PageHeader.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import {
  sortActiveQueue,
  type DismissalCallView,
} from '@/composables/useDismissalUrgency'
import {
  classroomOptionsForStudents,
  ACTIVE_STATUSES,
  type ClassroomInput,
} from '@/composables/useDismissalRoster'

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

interface DismissalCall {
  id: number
  student_id?: number
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
// 班級清單刻意不走全域 classroomStore：那支 store 由 8 個頁面共用、且 _createFetchStore
// 呼叫 apiFn() 不帶參數，只拿得到「當期學期」的班級。接送通知的名單是「今天在籍的孩子」
// 不跟學期，暑假期間學生已編入下學年班級，用當期清單會全部對不上班級（2026-07-30 根因）。
const classrooms = ref<ClassroomInput[]>([])

// 看板排序（與教師端共用 sortActiveQueue：已抵達優先依 arrived_at 舊→新，
// 未抵達的預告依 expected_arrival_at 近→遠；staff 舊資料 arrived_at=requested_at
// → 等價原 FIFO）。isActiveView 時仍用來算頁首「待接送 N」計數徽章；calls.value
// 在 active 檢視下現在可能含 completed 記錄（見下方 fetchCalls 的 D5 修正），
// 這裡明確只算 pending/acknowledged，避免計數把已放學的孩子也算進「待接送」。
const isActiveView = computed(() => filterStatus.value === 'active')
const sortedCalls = computed(() =>
  sortActiveQueue(
    (calls.value as DismissalCallView[]).filter(c => ACTIVE_STATUSES.has(c.status ?? '')),
  ),
)
// 供 T-011 DismissalPosBoard 使用（中欄 roster 分組 + 右欄 active 佇列共用同一份，不重複打 API）。
// D5：中欄「家長已接送」徽章與右欄的 done（已放學）卡都需要今日 completed 記錄，
// 所以 active 檢視下 calls.value 本身就不再過濾狀態（見 fetchCalls）；右欄的
// active／done 分流交給 useDismissalPosQueue.ts 自己做（同一份 ACTIVE_STATUSES
// 單一事實來源）。
const posBoardCalls = computed(() => calls.value as DismissalCallView[])

// 篩選
const filterStatus = ref('active') // active=pending+acknowledged | completed | cancelled | all
const filterClassroomId = ref<number | null>(null)

// 建立通知 dialog
const createDialogVisible = ref(false)
const createLoading = ref(false)
const students = ref<StudentItem[]>([])
const createForm = ref<{ student_id: number | null; classroom_id: number | null; note: string }>({ student_id: null, classroom_id: null, note: '' })
const createFilterClassroomId = ref(null)

// 班級篩選選項：班級清單含歷年班級，只列出實際有在籍學生的班（同名班補學期標籤）。
const classroomOptions = computed(() =>
  classroomOptionsForStudents(students.value, classrooms.value),
)

const filteredStudentOptions = computed(() => {
  if (!createFilterClassroomId.value) return students.value
  return students.value.filter(s => s.classroom_id === createFilterClassroomId.value)
})

const classroomNameMap = computed(() =>
  Object.fromEntries(classrooms.value.map(c => [c.id, c.name]))
)

const studentLabel = (s: StudentItem) => {
  const cName = classroomNameMap.value[s.classroom_id]
  return cName ? `${s.name}（${cName}）` : s.name
}

// WebSocket
let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let wsRecoveryTimer: ReturnType<typeof setTimeout> | null = null
let wsLivenessTimer: ReturnType<typeof setTimeout> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
const wsReconnectCount = ref(0)
const WS_MAX_RETRIES = 5
const wsConnected = ref(false)
const wsExhausted = ref(false) // 已達重試上限，fallback 至 polling
const lastWsClose = ref<WebSocketCloseInfo | null>(null)
// 只允許最後發出的 HTTP 快照寫入；visibility 補抓與 WS onopen 補抓可能重疊，
// 較舊 response 晚到時不得把較新的接送狀態覆蓋掉。
let fetchDispatchSeq = 0

// 連線體感狀態：normal / reconnecting / exhausted（對齊 PortalDismissalCallsView）
const connectionState = computed(() => {
  if (wsConnected.value) return 'normal'
  if (wsExhausted.value) return 'exhausted'
  return 'reconnecting'
})
const connectionMessage = computed(() =>
  lastWsClose.value?.message || '網路可能暫時不穩，系統會自動重連',
)

// ─── HTTP 載入 ───────────────────────────────────────────
const fetchCalls = async () => {
  const mySeq = ++fetchDispatchSeq
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (filterClassroomId.value) params.classroom_id = filterClassroomId.value
    // active 篩選不帶 status 參數：D5 定案「家長已接送」＝今日 completed 的既有
    // 資料，POS 中欄徽章需要吃得到這筆，而 GET /api/dismissal-calls 不帶 status
    // 篩選即回今日全部狀態（含 completed）。右欄佇列只顯示 pending/acknowledged
    // 由 sortedCalls／useDismissalPosQueue 各自過濾（同一份 ACTIVE_STATUSES），
    // 不靠這裡的查詢參數把 completed 擋在外面。completed/cancelled 篩選狀態仍
    // 明確帶 status，維持既有歷史表格行為不變。
    if (filterStatus.value !== 'all' && filterStatus.value !== 'active') {
      params.status = filterStatus.value
    }
    const res = await getDismissalCalls(params)
    if (mySeq !== fetchDispatchSeq) return
    calls.value = (res.data || []) as DismissalCall[]
  } catch (e) {
    // 過時快照不再彈錯（前一輪請求已被新一輪取代）
    if (mySeq === fetchDispatchSeq) ElMessage.error(friendlyError('載入接送通知失敗', e))
  } finally {
    if (mySeq === fetchDispatchSeq) loading.value = false
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

// ─── 學生清單載入（點名單 + Dialog 共用）────────────────
// 翻頁到底（仿 useBusRouteEditor.loadStudents）：單發 limit:500 在學生數
// 超過上限時會靜默截斷，漏掉的學生無法發接送通知。
const STUDENT_PAGE_SIZE = 500
const MAX_STUDENT_PAGES = 10
const loadStudents = async () => {
  try {
    const collected: StudentItem[] = []
    let skip = 0
    for (let page = 0; page < MAX_STUDENT_PAGES; page += 1) {
      const res = await getStudents({ is_active: true, limit: STUDENT_PAGE_SIZE, skip })
      const data = res.data as { items?: StudentItem[]; total?: number }
      const items = data.items || []
      collected.push(...items)
      skip += items.length
      if (items.length === 0 || collected.length >= (data.total ?? collected.length)) break
    }
    students.value = collected
  } catch (e) {
    ElMessage.error(friendlyError('載入學生清單失敗', e))
  }
}

// ─── 班級清單載入（跨學期）───────────────────────────────
// current_only=false 是關鍵：後端預設只回當期學期的班級，而學生名單不跟學期，
// 兩邊錯配時學生的班級會查不到（暑假期間學生已編入下學年班級 → 整批誤標）。
const loadClassrooms = async () => {
  try {
    const res = await getClassrooms({ current_only: false })
    classrooms.value = (res.data || []) as ClassroomInput[]
  } catch (e) {
    ElMessage.error(friendlyError('載入班級清單失敗', e))
  }
}

// ─── 建立通知（備註路徑，少見情境走 Dialog）──────────────
const openCreateDialog = async () => {
  createForm.value = { student_id: null, classroom_id: null, note: '' }
  createFilterClassroomId.value = null
  if (students.value.length === 0) await loadStudents() // 點名單已於掛載時載入，通常直接命中快取
  createDialogVisible.value = true
}

// 切換班級篩選時，若已選學生不在該班則清除
watch(createFilterClassroomId, (newVal) => {
  if (!newVal) return
  const selected = students.value.find(s => s.id === createForm.value.student_id)
  if (selected && selected.classroom_id !== newVal) {
    createForm.value.student_id = null
    createForm.value.classroom_id = null
  }
})

const onStudentSelect = (studentId: number) => {
  const s = students.value.find(s => s.id === studentId)
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
  if (document.visibilityState === 'hidden') return
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
    lastWsClose.value = classifyWebSocketClose({ code: 1006, reason: '' })
    scheduleReconnect()
  }, WS_LIVENESS_TIMEOUT_MS)
}

const stopPolling = () => {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null }
}

const startPolling = () => {
  stopPolling()
  pollingTimer = setInterval(fetchCalls, 15000)
}

const scheduleReconnect = () => {
  if (wsReconnectCount.value < WS_MAX_RETRIES) {
    const delay = Math.min(1000 * Math.pow(2, wsReconnectCount.value), 30000)
    wsReconnectCount.value++
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
    wsReconnectTimer = setTimeout(connectWs, delay)
  } else {
    // 快速重試耗盡後維持 HTTP polling，並持續低頻嘗試恢復 WebSocket。
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

const retryWsNow = () => {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  if (wsRecoveryTimer) { clearTimeout(wsRecoveryTimer); wsRecoveryTimer = null }
  closeWebSocketSafely(ws)
  ws = null
  wsReconnectCount.value = 0
  wsExhausted.value = false
  connectWs()
}

const connectWs = () => {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  // 透過 Vite proxy（/api/ws/*），cookie 由瀏覽器自動攜帶
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const socket = new WebSocket(`${proto}://${location.host}/api/ws/admin/dismissal-calls`)
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
    // 重連後重新 fetch，補回斷線期間的更新
    fetchCalls()
  }

  socket.onmessage = (e) => {
    if (ws !== socket) return
    bumpLiveness()
    try {
      const event = JSON.parse(e.data)
      // 後端 _recv_loop 等 client 任何訊息回應，90 秒沒收就主動斷線。
      // ping 來時必須回送任意訊息以維持連線存活。
      if (event.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }))
        return
      }
      handleWsEvent(event)
    } catch { /* ignore */ }
  }

  socket.onerror = () => {
    if (ws !== socket) return
    wsConnected.value = false
  }

  socket.onclose = (event) => {
    if (ws !== socket) return
    ws = null
    wsConnected.value = false
    lastWsClose.value = classifyWebSocketClose(event)
    clearLiveness()
    scheduleReconnect()
  }
}

const onVisibility = () => {
  if (document.visibilityState !== 'visible') {
    clearLiveness()
    return
  }
  fetchCalls()
  if (ws?.readyState === WebSocket.OPEN) {
    bumpLiveness()
    return
  }
  retryWsNow()
}

const handleWsEvent = (event: { type: string; payload: DismissalCall }) => {
  const { type, payload } = event
  if (type === 'dismissal_call_created') {
    // id 去重：自己一鍵 / Dialog 建立時 fetchCalls 已入列、WS echo 又送同一筆會雙加；
    // 亦涵蓋 polling fallback 期間 WS 重連補抓造成的重複（對齊 useDismissalRoster 去重教訓）。
    if (calls.value.some(c => c.id === payload.id)) return
    // 若目前顯示 active，prepend
    if (filterStatus.value === 'active' || filterStatus.value === 'all') {
      if (!calls.value.some(c => c.id === payload.id)) {
        calls.value.unshift(payload)
      }
    }
  } else if (type === 'dismissal_call_updated' || type === 'dismissal_call_arrived') {
    // arrived（pnotice01 家長/辦公室標記已到門口）與 updated 同為 upsert 語意；
    // 重複事件以 id 定位 splice 替換，天然 idempotent 不重複插卡。轉為 completed
    // 時不再從 calls.value 移除（D5：中欄「家長已接送」徽章要吃得到這筆），單純
    // upsert 成最新狀態即可——它會自然從 sortedCalls／右欄佇列的 active 過濾中
    // 消失，改以右欄尾端的 done（已放學）卡與中欄徽章（useStudentPosStatus）呈現。
    const idx = calls.value.findIndex(c => c.id === payload.id)
    if (idx !== -1) {
      calls.value.splice(idx, 1, payload)
    } else if (
      type === 'dismissal_call_arrived' &&
      (filterStatus.value === 'active' || filterStatus.value === 'all')
    ) {
      // 斷線期間錯過 created、先收到 arrived：補插卡避免佇列缺漏
      calls.value.unshift(payload)
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

// 後端時間是台北 naive 字串，統一走 formatTaipeiClock 顯式錨定 +08:00 並以
// Asia/Taipei 格式化，任何裝置時區都顯示正確台北時刻（修原 new Date 在非台灣
// 裝置會差 8 小時的顯示 bug；與 portal / 家長時間軸同源）。
const formatTime = (dt: string | undefined) => formatTaipeiClock(dt) ?? '-'

// ─── Lifecycle ────────────────────────────────────────────
onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibility)
  // 班級清單走本頁 loadClassrooms（見檔頭註解：刻意不走全域 classroomStore）
  await Promise.all([fetchCalls(), loadClassrooms(), loadStudents()])
  connectWs()
})

onUnmounted(() => {
  // 讓卸載後才完成的 HTTP request 失效，避免舊頁面狀態回填。
  fetchDispatchSeq++
  document.removeEventListener('visibilitychange', onVisibility)
  // 先卸 handler 再 close，避免 close() 觸發 onclose → scheduleReconnect 在卸載後
  // 建殭屍重連（QA 2026-06-04 P2-5）。
  closeWebSocketSafely(ws)
  ws = null
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  if (wsRecoveryTimer) { clearTimeout(wsRecoveryTimer); wsRecoveryTimer = null }
  clearLiveness()
  stopPolling()
})
</script>

<template>
  <div class="dismissal-queue-view">
    <PageHeader :title="PAGE_TERMS.dismissalQueue">
      <template #title-extra>
        <span
          v-if="isActiveView && sortedCalls.length"
          class="page-header__count"
        >待接送 {{ sortedCalls.length }}</span>
      </template>
      <template #actions>
        <el-tag
          :type="wsConnected ? 'success' : 'warning'"
          size="small"
          effect="light"
          class="conn-tag"
        >
          {{ wsConnected ? '即時同步中' : '連線不穩' }}
        </el-tag>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">建立通知</el-button>
      </template>
    </PageHeader>

    <!-- 連線狀態 banner（reconnecting 黃 / exhausted 紅）：耗盡後維持
         fallback 輪詢與低頻 WS 恢復（對齊 PortalDismissalCallsView）-->
    <div
      v-if="connectionState !== 'normal'"
      class="conn-banner"
      :class="`conn-banner--${connectionState}`"
      role="alert"
      data-testid="dismissal-conn-banner"
    >
      <div class="conn-banner__text">
        <template v-if="connectionState === 'reconnecting'">
          <span>即時連線中斷，正在重新連線</span>
          <span class="conn-banner__sub">{{ connectionMessage }}（第 {{ wsReconnectCount }} / {{ WS_MAX_RETRIES }} 次）</span>
        </template>
        <template v-else>
          <span>即時連線失敗，目前改用備援接收（每 15 秒更新一次）</span>
          <span class="conn-banner__sub">{{ connectionMessage }}；系統會持續低頻重連</span>
        </template>
      </div>
      <el-button
        v-if="connectionState === 'exhausted'"
        type="danger"
        size="small"
        :icon="Refresh"
        class="conn-banner__btn"
        data-testid="dismissal-conn-retry"
        @click="retryWsNow"
      >立即重連</el-button>
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
          <el-option
            v-for="c in classroomOptions"
            :key="c.id"
            :label="c.label"
            :value="c.id"
            data-testid="dismissal-classroom-option"
          />
        </el-select>
      </el-col>
      <el-col :xs="24" :sm="4">
        <el-button @click="fetchCalls" :loading="loading">重新整理</el-button>
      </el-col>
    </el-row>

    <!-- active 視圖：三欄 POS 佈局（左＝班級列表／中＝該班學生 card／右＝接送排序佇列），
         取代原本的搜尋框＋待接送看板＋點名單三段（D7）。DismissalPosBoard 內部自行組裝
         T-005/T-007/T-010，並用 useDismissalPosQueue 管理右欄 5 秒倒數＋合併排序。 -->
    <template v-if="isActiveView">
      <DismissalPosBoard
        :classrooms="classrooms"
        :students="students"
        :calls="posBoardCalls"
      />
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
      <el-table-column label="抵達時間" width="100">
        <template #default="{ row }">{{ formatTime(row.arrived_at) }}</template>
      </el-table-column>
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
            <el-option v-for="c in classroomOptions" :key="c.id" :label="c.label" :value="c.id" />
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
  padding: var(--space-5);
  /* 接上 AdminLayout.vue .content-container 的 height:100% 鏈，讓下方三欄 POS
     佈局（.pos-board）的 flex:1; min-height:0 真的有邊界高度可用，三欄才能各自
     overflow-y:auto 獨立捲動，而不是整個 .dismissal-queue-view 撐高、改由外層
     .el-main 產生單一整頁捲動。PageHeader／連線 banner／篩選列皆維持預設
     flex-shrink，內容多高就多高，只有最下面那個 flex 項目（POS 版或歷史表格）
     會吃掉剩餘空間；歷史表格分支未設 min-height:0，維持既有『內容撐高、
     el-main 捲動』行為不變（D7）。

     repo 內另一個「固定高度＋內部捲動」的既有案例是
     src/components/activity/POSCheckoutPanel.vue 的 .pos-panel-wrap__col--pay
     （max-height: calc(100vh - 140px) + sticky），靠魔術數字貼齊已知的 header
     高度。這裡改走 height:100% 這條鏈是刻意選的不同解法——POS 佈局的
     PageHeader／連線 banner／篩選列高度會隨篩選狀態、連線是否異常而變動，
     魔術數字算不準；height:100% 鏈不受這些高度變化影響，但需要 AdminLayout.vue
     多一行 height:100%（見該檔 .content-container 的註解）。 */
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 待接送即時計數：與教師端 portal 一致，一眼掌握還有幾位待處理
   （置於 PageHeader #title-extra slot，slot 內容持有本檔 scope id，樣式可達） */
.page-header__count {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.conn-tag {
  /* gap 由 .header-actions 負責，移除舊 inline margin */
  flex-shrink: 0;
}

/* ─── 連線狀態 banner（對齊 PortalDismissalCallsView）─── */
.conn-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-radius: var(--radius-md, 8px);
  margin-bottom: var(--space-4);
  border: 1px solid transparent;
}
.conn-banner--reconnecting {
  background-color: var(--color-warning-soft, #fdf6ec);
  color: var(--text-primary, #1f2937);
  border-color: var(--color-warning, #e6a23c);
}
.conn-banner--exhausted {
  background-color: var(--color-danger-soft, #fef0f0);
  color: var(--text-primary, #1f2937);
  border-color: var(--color-danger, #f56c6c);
}
.conn-banner__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-sm, 14px);
  font-weight: 500;
}
.conn-banner__sub {
  font-size: var(--text-xs, 12px);
  color: var(--text-secondary, #6b7280);
  font-weight: 400;
}
.conn-banner__btn {
  flex-shrink: 0;
}

.filter-bar {
  margin-bottom: var(--space-4);
}

.calls-table {
  border-radius: var(--radius-md);
}

.table-empty {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

/* 手機：頁面 padding 收斂（歷史表格窄螢幕仍需要，POS 三欄本身另有自己的斷點） */
@media (max-width: 560px) {
  .dismissal-queue-view {
    padding: var(--space-3);
  }
}
</style>
