<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { Search, Plus, Check, Loading, Refresh } from '@element-plus/icons-vue'
import { getDismissalCalls, cancelDismissalCall, createDismissalCall } from '@/api/dismissalCalls'
import { getClassrooms } from '@/api/classrooms'
import { getStudents } from '@/api/students'
import DismissalCallCard from '@/components/dismissal/DismissalCallCard.vue'
import { closeWebSocketSafely } from '@/utils/ws'
import { formatTaipeiClock } from '@/utils/taipeiTime'
import PageHeader from '@/components/common/PageHeader.vue'
import {
  useNowClock,
  sortByOldestFirst,
  type DismissalCallView,
} from '@/composables/useDismissalUrgency'
import {
  buildRoster,
  classroomOptionsForStudents,
  type RosterStudent,
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
const students = ref<StudentItem[]>([])
const createForm = ref<{ student_id: number | null; classroom_id: number | null; note: string }>({ student_id: null, classroom_id: null, note: '' })
const createFilterClassroomId = ref(null)

// ─── 點名單一鍵發起 ──────────────────────────────────────
// 在籍學生依班級分組，點 chip 即建立通知；已在通知中的學生由 buildRoster 標 notifying
// （從源頭擋後端 409），建立中的學生暫存 inFlight 給即時回饋。
const rosterQuery = ref('')
const inFlight = ref<Set<number>>(new Set())

const roster = computed(() => {
  const groups = buildRoster(
    students.value,
    classrooms.value,
    calls.value,
    rosterQuery.value,
  )
  // 與看板共用 filterClassroomId：選了班級時點名單也只顯示該班
  if (filterClassroomId.value == null) return groups
  return groups.filter(g => g.classroomId === filterClassroomId.value)
})

const rosterFlatStudents = computed(() => roster.value.flatMap(g => g.students))

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
let wsLivenessTimer: ReturnType<typeof setTimeout> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
const wsReconnectCount = ref(0)
const WS_MAX_RETRIES = 5
// 後端每 30s 主動 ping；逾 1.5×（45s）未收到任何訊息即視為半開死連線
// （TCP 半開時 onclose/onerror 可能永不觸發），主動踢掉重連避免靜默漏接。
const WS_LIVENESS_TIMEOUT = 45000
const wsConnected = ref(false)
const wsExhausted = ref(false) // 已達重試上限，fallback 至 polling

// 連線體感狀態：normal / reconnecting / exhausted（對齊 PortalDismissalCallsView）
const connectionState = computed(() => {
  if (wsConnected.value) return 'normal'
  if (wsExhausted.value) return 'exhausted'
  return 'reconnecting'
})

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
    ElMessage.error(friendlyError('載入接送通知失敗', e))
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

// ─── 學生清單載入（點名單 + Dialog 共用）────────────────
const loadStudents = async () => {
  try {
    const res = await getStudents({ is_active: true, limit: 500 })
    students.value = ((res.data as { items?: StudentItem[] }).items || []) as StudentItem[]
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

// ─── 點名單一鍵發起 ──────────────────────────────────────
// inFlight 即時回饋 → 成功後 refetch 保證新通知入列、chip 轉 notifying。
// WS echo 由 handleWsEvent 的 id 去重擋掉重覆。
const handleQuickCreate = async (student: RosterStudent) => {
  if (student.classroomId == null) return // 未分班無法建立（後端需 classroom_id）
  if (student.notifying || inFlight.value.has(student.id)) return
  inFlight.value.add(student.id)
  try {
    await createDismissalCall({ student_id: student.id, classroom_id: student.classroomId })
    await fetchCalls()
    ElMessage.success(`已通知接送：${student.name}`)
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { detail?: string } } }
    if (err.response?.status === 409) {
      await fetchCalls() // 多半他人剛建立，補狀態讓 chip 轉灰
      ElMessage.info(`${student.name} 已有進行中的接送通知`)
    } else {
      ElMessage.error(err.response?.data?.detail || '建立失敗')
    }
  } finally {
    inFlight.value.delete(student.id)
  }
}

// 搜尋框按 Enter：若篩到剩唯一可發起的學生，直接建立並清空搜尋。
const onRosterEnter = () => {
  const candidates = rosterFlatStudents.value.filter(
    s => !s.notifying && !inFlight.value.has(s.id) && s.classroomId != null,
  )
  if (candidates.length === 1) {
    handleQuickCreate(candidates[0])
    rosterQuery.value = ''
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
    wsReconnectTimer = setTimeout(connectWs, delay)
  } else {
    // 超過重試上限，改用 polling，並升級 banner 提醒使用者重新整理
    // （對齊 PortalDismissalCallsView，避免耗盡後靜默停止漏接通知）
    wsExhausted.value = true
    startPolling()
  }
}

const reloadPage = () => {
  location.reload()
}

const connectWs = () => {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  // 透過 Vite proxy（/api/ws/*），cookie 由瀏覽器自動攜帶
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/api/ws/admin/dismissal-calls`)

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
    // id 去重：自己一鍵 / Dialog 建立時 fetchCalls 已入列、WS echo 又送同一筆會雙加；
    // 亦涵蓋 polling fallback 期間 WS 重連補抓造成的重複（對齊 useDismissalRoster 去重教訓）。
    if (calls.value.some(c => c.id === payload.id)) return
    // 若目前顯示 active，prepend
    if (filterStatus.value === 'active' || filterStatus.value === 'all') {
      if (!calls.value.some(c => c.id === payload.id)) {
        calls.value.unshift(payload)
      }
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

// 後端時間是台北 naive 字串，統一走 formatTaipeiClock 顯式錨定 +08:00 並以
// Asia/Taipei 格式化，任何裝置時區都顯示正確台北時刻（修原 new Date 在非台灣
// 裝置會差 8 小時的顯示 bug；與 portal / 家長時間軸同源）。
const formatTime = (dt: string | undefined) => formatTaipeiClock(dt) ?? '-'

// ─── Lifecycle ────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([fetchCalls(), loadClassrooms(), loadStudents()])
  connectWs()
})

onUnmounted(() => {
  // 先卸 handler 再 close，避免 close() 觸發 onclose → scheduleReconnect 在卸載後
  // 建殭屍重連（QA 2026-06-04 P2-5）。
  closeWebSocketSafely(ws)
  ws = null
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  clearLiveness()
  stopPolling()
})
</script>

<template>
  <div class="dismissal-queue-view">
    <PageHeader title="接送通知">
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

    <!-- 連線狀態 banner（reconnecting 黃 / exhausted 紅）：耗盡重連後
         fallback 輪詢，提醒使用者重新整理避免漏接（對齊 PortalDismissalCallsView）-->
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
        data-testid="dismissal-conn-reload"
        @click="reloadPage"
      >重新整理</el-button>
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

    <!-- active 視圖：搜尋 + 待接送看板 + 點名單一鍵發起 -->
    <template v-if="isActiveView">
      <!-- 搜尋框：篩點名單，按 Enter 若剩唯一相符即直接發起 -->
      <el-input
        v-model="rosterQuery"
        class="roster-search"
        placeholder="搜尋學生姓名，點選即可通知接送"
        clearable
        :prefix-icon="Search"
        @keyup.enter="onRosterEnter"
      />

      <!-- 待接送（進行中）：最久優先，等候時間升級色一眼看出哪班老師還沒回應 -->
      <section class="board-section">
        <h3 class="section-title">
          待接送<span class="section-title__count">{{ sortedCalls.length }}</span>
        </h3>
        <div v-if="sortedCalls.length === 0 && !loading" class="board-empty">
          目前沒有等待接送的孩子，點下方點名單即可通知
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
      </section>

      <!-- 點名單：點學生 chip 一鍵發起；已在通知中灰底停用 -->
      <section class="roster-section">
        <h3 class="section-title">點名單</h3>
        <div v-if="roster.length === 0" class="roster-empty">
          {{ rosterQuery ? '找不到符合的學生' : '沒有在籍學生' }}
        </div>
        <div
          v-for="group in roster"
          :key="group.kind === 'classroom' ? group.classroomId! : group.kind"
          class="roster-group"
        >
          <div class="roster-group__head">
            <span class="roster-group__name">{{ group.classroomName }}</span>
            <!-- 非正常班級的兩種情形結果不同（一種點得動、一種點不動），要講明白 -->
            <span v-if="group.kind !== 'classroom'" class="roster-group__hint">
              {{ group.kind === 'unknown' ? '班級不在目前清單中，仍可通知' : '沒有班級，無法通知' }}
            </span>
          </div>
          <div class="roster-chips">
            <button
              v-for="s in group.students"
              :key="s.id"
              type="button"
              class="chip"
              :class="{ 'is-notifying': s.notifying, 'is-inflight': inFlight.has(s.id) }"
              :disabled="s.notifying || inFlight.has(s.id) || s.classroomId == null"
              :title="s.classroomId == null ? '未分班，無法發起' : s.name"
              @click="handleQuickCreate(s)"
            >
              <el-icon v-if="inFlight.has(s.id)" class="chip__ico is-loading"><Loading /></el-icon>
              <el-icon v-else-if="s.notifying" class="chip__ico"><Check /></el-icon>
              <el-icon v-else class="chip__ico"><Plus /></el-icon>
              <span class="chip__name">{{ s.name }}</span>
              <span v-if="s.notifying" class="chip__tag">通知中</span>
            </button>
          </div>
        </div>
      </section>
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

/* ─── 待處理看板 ─── */
.board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3);
}

/* 手機：看板改單欄、頁面 padding 收斂，避免 320px 卡片最小寬在窄螢幕橫向溢出 */
@media (max-width: 560px) {
  .dismissal-queue-view {
    padding: var(--space-3);
  }
  .board {
    grid-template-columns: 1fr;
  }
}

.req-by {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* ─── 搜尋框 + 區段標題 ─── */
.roster-search {
  margin-bottom: var(--space-4);
  max-width: 420px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  font-size: var(--text-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}
.section-title__count {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: var(--text-xs);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.board-section {
  margin-bottom: var(--space-6);
}
.board-empty {
  padding: var(--space-4);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  text-align: center;
}

/* ─── 點名單 ─── */
.roster-empty {
  padding: var(--space-3) 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}
.roster-group {
  margin-bottom: var(--space-4);
}
.roster-group__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.roster-group__name {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-tertiary);
}
.roster-group__hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.roster-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* 學生 chip：點 = 一鍵發起 */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--touch-target-min);
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--surface-color);
  color: var(--text-primary);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background-color var(--transition-fast),
    color var(--transition-fast),
    box-shadow var(--transition-fast);
}
.chip:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}
.chip:active:not(:disabled) {
  transform: translateY(1px);
}
.chip:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.chip__ico {
  font-size: 14px;
  color: var(--color-primary);
}
.chip__name {
  white-space: nowrap;
}
.chip:disabled {
  cursor: default;
}

/* 已在通知中：綠底打勾、停用，從源頭擋重複建立 */
.chip.is-notifying {
  background: var(--color-success-soft);
  border-color: var(--color-success);
  color: #1a7f4b;
}
.chip.is-notifying .chip__ico {
  color: #1a7f4b;
}
.chip__tag {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
}
/* 建立中 */
.chip.is-inflight {
  cursor: progress;
  opacity: 0.75;
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
