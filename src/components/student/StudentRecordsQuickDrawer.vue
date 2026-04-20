<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Plus, SwitchButton } from '@element-plus/icons-vue'
import { getStudentRecordsTimeline } from '@/api/studentRecords'
import { getStudentProfile } from '@/api/students'
import { getRegistrations } from '@/api/activity'
import { getAttendanceByStudent } from '@/api/studentAttendance'
import { getFeeRecords } from '@/api/fees'
import {
  getCommunications,
  deleteCommunication,
} from '@/api/studentCommunications'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { domainBus, RECORD_EVENTS, STUDENT_EVENTS } from '@/utils/domainBus'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import {
  INCIDENT_TYPE_TAG,
  SEVERITY_TAG,
  RATING_TAG,
} from '@/constants/studentRecords'
import IncidentEditorDialog from './IncidentEditorDialog.vue'
import AssessmentEditorDialog from './AssessmentEditorDialog.vue'
import ChangeLogEditorDialog from './ChangeLogEditorDialog.vue'
import CommunicationEditorDialog from './CommunicationEditorDialog.vue'
import LifecycleTransitionDialog from './LifecycleTransitionDialog.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  student: { type: Object, default: null },
})
const emit = defineEmits(['update:visible', 'lifecycle-changed'])

const canReadActivity = hasPermission('ACTIVITY_READ')
const canReadFees = hasPermission('FEES_READ')
const canWriteStudents = hasPermission('STUDENTS_WRITE')
const canLifecycleWrite = hasPermission('STUDENTS_LIFECYCLE_WRITE')

const activeTab = ref('timeline')
const recordViewMode = ref('timeline') // 'timeline' | 'table'
const activeTableTab = ref('incident')

const items = ref([])
const loading = ref(false)
const dateRange = ref([])
const filterDateFrom = ref(null)
const filterDateTo = ref(null)

const registrations = ref([])
const registrationsLoading = ref(false)

const dailyAttendance = ref([])
const dailyAttendanceCounts = ref({})
const dailyAttendanceLoading = ref(false)

const feeRecords = ref([])
const feeRecordsLoading = ref(false)

const communications = ref([])
const communicationsLoading = ref(false)

const TYPE_TAG_COLOR = { incident: 'danger', assessment: 'success', change_log: 'warning' }
const TYPE_LABEL = { incident: '事件', assessment: '評量', change_log: '異動' }

const ATTENDANCE_TAG = {
  出席: 'success',
  缺席: 'danger',
  病假: 'warning',
  事假: 'info',
  遲到: 'warning',
}

const incidentDialog = reactive({ visible: false, mode: 'create', initial: null })
const assessmentDialog = reactive({ visible: false, mode: 'create', initial: null })
const changeLogDialog = reactive({ visible: false, mode: 'create', initial: null })
const communicationDialog = reactive({ visible: false, mode: 'create', initial: null })

const studentId = computed(() => props.student?.id ?? null)
const classroomId = computed(() => props.student?.classroom_id ?? null)

const groupedItems = computed(() => {
  const groups = { incident: [], assessment: [], change_log: [] }
  for (const it of items.value) {
    if (groups[it.record_type]) groups[it.record_type].push(it)
  }
  return groups
})

async function fetchTimeline() {
  if (!studentId.value) { items.value = []; return }
  loading.value = true
  try {
    const params = {
      student_id: studentId.value,
      page: 1,
      page_size: 200,
    }
    if (filterDateFrom.value) params.date_from = filterDateFrom.value
    if (filterDateTo.value) params.date_to = filterDateTo.value
    const res = await getStudentRecordsTimeline(params)
    items.value = res.data.items || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入紀錄失敗'))
  } finally {
    loading.value = false
  }
}

async function fetchRegistrations() {
  if (!studentId.value || !canReadActivity) { registrations.value = []; return }
  registrationsLoading.value = true
  try {
    const res = await getRegistrations({
      student_id: studentId.value,
      limit: 100,
    })
    registrations.value = res.data.items || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入才藝報名紀錄失敗'))
  } finally {
    registrationsLoading.value = false
  }
}

async function fetchDailyAttendance() {
  if (!studentId.value) { dailyAttendance.value = []; return }
  dailyAttendanceLoading.value = true
  try {
    const res = await getAttendanceByStudent(studentId.value, { limit: 200 })
    dailyAttendance.value = res.data.items || []
    dailyAttendanceCounts.value = res.data.counts || {}
  } catch (e) {
    ElMessage.error(apiError(e, '載入每日出席失敗'))
  } finally {
    dailyAttendanceLoading.value = false
  }
}

async function fetchFeeRecords() {
  if (!studentId.value || !canReadFees) { feeRecords.value = []; return }
  feeRecordsLoading.value = true
  try {
    const data = await getFeeRecords({
      student_id: studentId.value,
      page_size: 200,
    })
    feeRecords.value = data.items || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入學費紀錄失敗'))
  } finally {
    feeRecordsLoading.value = false
  }
}

async function fetchCommunications() {
  if (!studentId.value) { communications.value = []; return }
  communicationsLoading.value = true
  try {
    const res = await getCommunications({
      student_id: studentId.value,
      page_size: 200,
    })
    communications.value = res.data.items || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入家長溝通紀錄失敗'))
  } finally {
    communicationsLoading.value = false
  }
}

function refreshActiveTab() {
  if (activeTab.value === 'timeline') fetchTimeline()
  else if (activeTab.value === 'registration') fetchRegistrations()
  else if (activeTab.value === 'daily_attendance') fetchDailyAttendance()
  else if (activeTab.value === 'fees') fetchFeeRecords()
  else if (activeTab.value === 'communications') fetchCommunications()
}

function handleDateRangeChange(v) {
  filterDateFrom.value = v?.[0] || null
  filterDateTo.value = v?.[1] || null
  fetchTimeline()
}

function resetFilters() {
  dateRange.value = []
  filterDateFrom.value = null
  filterDateTo.value = null
  fetchTimeline()
}

watch(
  () => [props.visible, studentId.value, activeTab.value],
  ([visible]) => { if (visible) refreshActiveTab() },
  { immediate: true },
)

const onBusRefresh = () => { if (props.visible && activeTab.value === 'timeline') fetchTimeline() }
const busEvents = [
  RECORD_EVENTS.CREATED,
  RECORD_EVENTS.UPDATED,
  RECORD_EVENTS.DELETED,
  STUDENT_EVENTS.LIFECYCLE_CHANGED,
]
busEvents.forEach((evt) => domainBus.on(evt, onBusRefresh))
onUnmounted(() => {
  busEvents.forEach((evt) => domainBus.off(evt, onBusRefresh))
})

const handleClose = () => emit('update:visible', false)

const openCreate = (type) => {
  if (type === 'incident') {
    incidentDialog.initial = null
    incidentDialog.mode = 'create'
    incidentDialog.visible = true
  } else if (type === 'assessment') {
    assessmentDialog.initial = null
    assessmentDialog.mode = 'create'
    assessmentDialog.visible = true
  }
}

const lifecycleDialogVisible = ref(false)
const lifecycleCurrentStatus = ref('active')
const lifecycleLoading = ref(false)
const openLifecycleDialog = async () => {
  if (!studentId.value) return
  lifecycleLoading.value = true
  try {
    const { data } = await getStudentProfile(studentId.value, { timeline_limit: 1, incident_limit: 1 })
    lifecycleCurrentStatus.value = data?.lifecycle?.status || 'active'
  } catch {
    lifecycleCurrentStatus.value = props.student?.is_active === false ? 'withdrawn' : 'active'
  } finally {
    lifecycleLoading.value = false
  }
  lifecycleDialogVisible.value = true
}
const onLifecycleTransitioned = () => {
  fetchTimeline()
  emit('lifecycle-changed')
}

// 系統自動產生的異動 log 不可編輯/刪除（保護稽核軌跡）
const isMutableRecord = (row) => {
  if (row?.record_type !== 'change_log') return true
  return (row.payload?.source || 'manual') === 'manual'
}

const openEdit = (row) => {
  const p = row.payload || {}
  if (row.record_type === 'incident') {
    incidentDialog.initial = {
      id: row.record_id,
      student_id: row.student_id,
      student_name: row.student_name,
      classroom_id: row.classroom_id,
      incident_type: p.incident_type,
      severity: p.severity,
      occurred_at: row.occurred_at,
      description: p.description,
      action_taken: p.action_taken,
      parent_notified: p.parent_notified,
    }
    incidentDialog.mode = 'edit'
    incidentDialog.visible = true
  } else if (row.record_type === 'assessment') {
    assessmentDialog.initial = {
      id: row.record_id,
      student_id: row.student_id,
      student_name: row.student_name,
      classroom_id: row.classroom_id,
      semester: p.semester,
      assessment_type: p.assessment_type,
      domain: p.domain,
      rating: p.rating,
      content: p.content,
      suggestions: p.suggestions,
      assessment_date: p.assessment_date,
    }
    assessmentDialog.mode = 'edit'
    assessmentDialog.visible = true
  } else if (row.record_type === 'change_log') {
    changeLogDialog.initial = {
      id: row.record_id,
      student_id: row.student_id,
      student_name: row.student_name,
      school_year: p.school_year,
      semester: p.semester,
      event_type: p.event_type,
      event_date: p.event_date,
      reason: p.reason,
      notes: p.notes,
    }
    changeLogDialog.mode = 'edit'
    changeLogDialog.visible = true
  }
}

const openCreateCommunication = () => {
  communicationDialog.initial = null
  communicationDialog.mode = 'create'
  communicationDialog.visible = true
}

const openEditCommunication = (row) => {
  communicationDialog.initial = { ...row }
  communicationDialog.mode = 'edit'
  communicationDialog.visible = true
}

const handleDeleteCommunication = async (row) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆家長溝通紀錄？', '確認刪除', { type: 'warning' })
    await deleteCommunication(row.id)
    ElMessage.success('刪除成功')
    fetchCommunications()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const handleDelete = async (row) => {
  const msg = `確定要刪除這筆${TYPE_LABEL[row.record_type]}紀錄？`
  try {
    await ElMessageBox.confirm(msg, '確認刪除', { type: 'warning' })
    const recordsStore = useStudentRecordsStore()
    await recordsStore.deleteRecord(row.record_type, row.record_id, { student_id: row.student_id })
    ElMessage.success('刪除成功')
    fetchTimeline()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const formatTimestamp = (iso) => {
  if (!iso) return '-'
  const s = String(iso)
  return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s
}

const truncate = (text, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

const formatSemesterLabel = (row) => {
  if (row?.school_year && row?.semester) {
    return `${row.school_year} 學年 ${row.semester === 1 ? '上' : '下'}學期`
  }
  return '-'
}

const paymentStatusLabel = (row) => {
  const total = row.total_amount || 0
  const paid = row.paid_amount || 0
  if (total > 0 && paid >= total) return { label: '已繳費', type: 'success' }
  if (paid > 0) return { label: '部分繳費', type: 'warning' }
  return { label: '未繳費', type: 'info' }
}

const FEE_STATUS_LABEL = { paid: '已繳', partial: '部分', unpaid: '未繳' }
const FEE_STATUS_TYPE = { paid: 'success', partial: 'warning', unpaid: 'danger' }

const feeTotals = computed(() => {
  const acc = { due: 0, paid: 0, unpaid: 0, partial: 0 }
  for (const r of feeRecords.value) {
    acc.due += r.amount_due || 0
    acc.paid += r.amount_paid || 0
    if (r.status === 'unpaid') acc.unpaid += 1
    if (r.status === 'partial') acc.partial += 1
  }
  return acc
})

const COMM_TYPE_TAG = {
  電話: 'primary',
  LINE: 'success',
  面談: 'warning',
  Email: 'info',
  家聯簿: '',
  簡訊: 'primary',
  其他: 'info',
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="student ? `${student.name} · 學生紀錄` : '學生紀錄'"
    width="85%"
    top="5vh"
    :before-close="(done) => { handleClose(); done() }"
    class="student-records-dialog"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="quick-records">
      <div class="header-row">
        <div class="header-left">
          <el-tag v-if="student?.gender === '男'" type="primary" size="small">男</el-tag>
          <el-tag v-else-if="student?.gender === '女'" type="danger" size="small">女</el-tag>
          <span v-if="student?.student_id" class="chip">學號 {{ student.student_id }}</span>
          <span v-if="student?.classroom_name" class="chip">{{ student.classroom_name }}</span>
          <el-tag v-if="student && student.is_active === false" type="info" size="small">已離班</el-tag>
        </div>
        <div class="header-right">
          <el-dropdown
            v-if="activeTab === 'timeline'"
            trigger="click"
            @command="openCreate"
          >
            <el-button type="primary" size="small" :icon="Plus">新增紀錄 ▾</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="incident">事件紀錄</el-dropdown-item>
                <el-dropdown-item command="assessment">學期評量</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button
            v-if="activeTab === 'communications' && canWriteStudents"
            type="primary"
            size="small"
            :icon="Plus"
            @click="openCreateCommunication"
          >新增溝通</el-button>
          <el-button
            v-if="canLifecycleWrite && student && student.is_active !== false"
            size="small"
            :icon="SwitchButton"
            type="warning"
            plain
            @click="openLifecycleDialog"
          >變更狀態</el-button>
          <el-button size="small" :icon="Refresh" @click="refreshActiveTab">重新整理</el-button>
        </div>
      </div>

      <el-tabs v-model="activeTab" class="records-tabs">
        <!-- ── 綜合紀錄 ── -->
        <el-tab-pane label="綜合紀錄" name="timeline">
          <div class="sub-filter-bar">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              size="small"
              range-separator="至"
              start-placeholder="開始日期"
              end-placeholder="結束日期"
              value-format="YYYY-MM-DD"
              style="width: 280px"
              @change="handleDateRangeChange"
            />
            <el-radio-group v-model="recordViewMode" size="small">
              <el-radio-button value="timeline">時間軸</el-radio-button>
              <el-radio-button value="table">分類表格</el-radio-button>
            </el-radio-group>
            <el-button size="small" text @click="resetFilters">清除篩選</el-button>
            <div class="stat-row">
              <el-tag type="danger" size="small">事件 {{ groupedItems.incident.length }}</el-tag>
              <el-tag type="success" size="small">評量 {{ groupedItems.assessment.length }}</el-tag>
              <el-tag type="warning" size="small">異動 {{ groupedItems.change_log.length }}</el-tag>
            </div>
          </div>

          <!-- 時間軸 -->
          <div v-if="recordViewMode === 'timeline'" v-loading="loading" class="timeline-wrap">
            <el-empty v-if="!loading && !items.length" description="目前沒有紀錄" />
            <el-timeline v-else>
              <el-timeline-item
                v-for="row in items"
                :key="`${row.record_type}-${row.record_id}`"
                :type="TYPE_TAG_COLOR[row.record_type] || 'primary'"
                :timestamp="formatTimestamp(row.occurred_at)"
                placement="top"
              >
                <div class="record-card">
                  <div class="record-head">
                    <el-tag :type="TYPE_TAG_COLOR[row.record_type] || ''" size="small">
                      {{ TYPE_LABEL[row.record_type] }}
                    </el-tag>
                    <template v-if="row.record_type === 'incident'">
                      <el-tag v-if="row.payload?.incident_type" size="small" :type="INCIDENT_TYPE_TAG[row.payload.incident_type] || ''">
                        {{ row.payload.incident_type }}
                      </el-tag>
                      <el-tag v-if="row.payload?.severity" size="small" :type="SEVERITY_TAG[row.payload.severity] || ''">
                        {{ row.payload.severity }}
                      </el-tag>
                      <el-tag v-if="row.payload?.parent_notified" type="success" size="small">已通知家長</el-tag>
                    </template>
                    <template v-else-if="row.record_type === 'assessment'">
                      <el-tag v-if="row.payload?.domain" size="small">{{ row.payload.domain }}</el-tag>
                      <el-tag v-if="row.payload?.rating" size="small" :type="RATING_TAG[row.payload.rating] || ''">
                        {{ row.payload.rating }}
                      </el-tag>
                      <el-tag v-if="row.payload?.assessment_type" type="info" size="small">{{ row.payload.assessment_type }}</el-tag>
                    </template>
                    <template v-else-if="row.record_type === 'change_log'">
                      <el-tag v-if="row.payload?.event_type" size="small" type="warning">{{ row.payload.event_type }}</el-tag>
                      <el-tag v-if="row.payload?.source === 'lifecycle'" size="small" type="info">系統</el-tag>
                      <el-tag v-else size="small" effect="plain">補登</el-tag>
                    </template>
                    <div class="record-actions">
                      <template v-if="isMutableRecord(row)">
                        <el-button size="small" link @click="openEdit(row)">編輯</el-button>
                        <el-button size="small" link type="danger" @click="handleDelete(row)">刪除</el-button>
                      </template>
                      <el-tooltip
                        v-else
                        content="系統自動產生的稽核紀錄不可修改"
                        placement="top"
                      >
                        <el-text type="info" size="small" style="margin-left:6px">稽核保護</el-text>
                      </el-tooltip>
                    </div>
                  </div>
                  <div class="record-body">
                    <template v-if="row.record_type === 'incident'">
                      <div>{{ row.payload?.description }}</div>
                      <div v-if="row.payload?.action_taken" class="sub">處理：{{ row.payload.action_taken }}</div>
                    </template>
                    <template v-else-if="row.record_type === 'assessment'">
                      <div>{{ row.payload?.content }}</div>
                      <div v-if="row.payload?.suggestions" class="sub">建議：{{ row.payload.suggestions }}</div>
                    </template>
                    <template v-else-if="row.record_type === 'change_log'">
                      <div v-if="row.payload?.reason">原因：{{ row.payload.reason }}</div>
                      <div v-if="row.payload?.notes" class="sub">備註：{{ row.payload.notes }}</div>
                    </template>
                  </div>
                </div>
              </el-timeline-item>
            </el-timeline>
          </div>

          <!-- 分類表格 -->
          <el-tabs v-else v-model="activeTableTab" v-loading="loading" class="table-tabs">
            <el-tab-pane :label="`事件（${groupedItems.incident.length}）`" name="incident">
              <el-table :data="groupedItems.incident" stripe size="small" max-height="500">
                <el-table-column label="發生時間" width="150">
                  <template #default="{ row }">{{ formatTimestamp(row.occurred_at) }}</template>
                </el-table-column>
                <el-table-column label="類型" width="100">
                  <template #default="{ row }">
                    <el-tag v-if="row.payload?.incident_type" :type="INCIDENT_TYPE_TAG[row.payload.incident_type] || ''" size="small">
                      {{ row.payload.incident_type }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="嚴重度" width="90">
                  <template #default="{ row }">
                    <el-tag v-if="row.payload?.severity" :type="SEVERITY_TAG[row.payload.severity] || ''" size="small">
                      {{ row.payload.severity }}
                    </el-tag>
                    <span v-else class="sub">-</span>
                  </template>
                </el-table-column>
                <el-table-column label="描述" min-width="220">
                  <template #default="{ row }">
                    <el-tooltip :content="row.payload?.description || ''" placement="top" :show-after="500">
                      <span>{{ truncate(row.payload?.description || '') }}</span>
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column label="處理" min-width="160">
                  <template #default="{ row }">
                    <el-tooltip :content="row.payload?.action_taken || ''" placement="top" :show-after="500">
                      <span>{{ truncate(row.payload?.action_taken || '') }}</span>
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column label="家長" width="80" align="center">
                  <template #default="{ row }">
                    <el-tag v-if="row.payload?.parent_notified" type="success" size="small">已通知</el-tag>
                    <span v-else class="sub">-</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="130" fixed="right">
                  <template #default="{ row }">
                    <el-button size="small" text @click="openEdit(row)">編輯</el-button>
                    <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane :label="`評量（${groupedItems.assessment.length}）`" name="assessment">
              <el-table :data="groupedItems.assessment" stripe size="small" max-height="500">
                <el-table-column label="日期" width="110">
                  <template #default="{ row }">{{ row.payload?.assessment_date || '-' }}</template>
                </el-table-column>
                <el-table-column label="學期" width="100">
                  <template #default="{ row }">{{ row.payload?.semester || '-' }}</template>
                </el-table-column>
                <el-table-column label="類型" width="90">
                  <template #default="{ row }">
                    <el-tag v-if="row.payload?.assessment_type" type="info" size="small">{{ row.payload.assessment_type }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="領域" width="130">
                  <template #default="{ row }">{{ row.payload?.domain || '-' }}</template>
                </el-table-column>
                <el-table-column label="評等" width="80">
                  <template #default="{ row }">
                    <el-tag v-if="row.payload?.rating" :type="RATING_TAG[row.payload.rating] || ''" size="small">
                      {{ row.payload.rating }}
                    </el-tag>
                    <span v-else class="sub">-</span>
                  </template>
                </el-table-column>
                <el-table-column label="內容" min-width="220">
                  <template #default="{ row }">
                    <el-tooltip :content="row.payload?.content || ''" placement="top" :show-after="500">
                      <span>{{ truncate(row.payload?.content || '') }}</span>
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column label="建議" min-width="160">
                  <template #default="{ row }">
                    <el-tooltip :content="row.payload?.suggestions || ''" placement="top" :show-after="500">
                      <span>{{ truncate(row.payload?.suggestions || '') }}</span>
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="130" fixed="right">
                  <template #default="{ row }">
                    <el-button size="small" text @click="openEdit(row)">編輯</el-button>
                    <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>

            <el-tab-pane :label="`異動（${groupedItems.change_log.length}）`" name="change_log">
              <el-table :data="groupedItems.change_log" stripe size="small" max-height="500">
                <el-table-column label="異動日期" width="110">
                  <template #default="{ row }">{{ row.payload?.event_date || '-' }}</template>
                </el-table-column>
                <el-table-column label="學年" width="80">
                  <template #default="{ row }">{{ row.payload?.school_year || '-' }}</template>
                </el-table-column>
                <el-table-column label="學期" width="70">
                  <template #default="{ row }">
                    <span v-if="row.payload?.semester">{{ row.payload.semester === 1 ? '上' : '下' }}</span>
                    <span v-else class="sub">-</span>
                  </template>
                </el-table-column>
                <el-table-column label="異動類型" width="110">
                  <template #default="{ row }">
                    <el-tag v-if="row.payload?.event_type" type="warning" size="small">{{ row.payload.event_type }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="來源" width="80">
                  <template #default="{ row }">
                    <el-tag v-if="row.payload?.source === 'lifecycle'" size="small" type="info">系統</el-tag>
                    <el-tag v-else size="small" effect="plain">補登</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="原因" min-width="160">
                  <template #default="{ row }">
                    <el-tooltip :content="row.payload?.reason || ''" placement="top" :show-after="500">
                      <span>{{ truncate(row.payload?.reason || '') }}</span>
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column label="備註" min-width="160">
                  <template #default="{ row }">
                    <el-tooltip :content="row.payload?.notes || ''" placement="top" :show-after="500">
                      <span>{{ truncate(row.payload?.notes || '') }}</span>
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="130" fixed="right">
                  <template #default="{ row }">
                    <template v-if="isMutableRecord(row)">
                      <el-button size="small" text @click="openEdit(row)">編輯</el-button>
                      <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
                    </template>
                    <el-tooltip v-else content="系統自動紀錄，稽核保護" placement="top">
                      <el-text type="info" size="small">—</el-text>
                    </el-tooltip>
                  </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </el-tab-pane>

        <!-- ── 每日出席 ── -->
        <el-tab-pane label="每日出席" name="daily_attendance">
          <div v-if="dailyAttendanceCounts && Object.keys(dailyAttendanceCounts).length" class="stat-row stat-row--top">
            <el-tag v-for="(v, k) in dailyAttendanceCounts" :key="k" :type="ATTENDANCE_TAG[k] || 'info'" size="small">
              {{ k }} {{ v }}
            </el-tag>
          </div>
          <el-empty v-if="!dailyAttendanceLoading && !dailyAttendance.length" description="尚無出席紀錄" />
          <el-table
            v-else
            v-loading="dailyAttendanceLoading"
            :data="dailyAttendance"
            size="small"
            stripe
            max-height="560"
          >
            <el-table-column label="日期" prop="date" width="130" />
            <el-table-column label="狀態" width="100">
              <template #default="{ row }">
                <el-tag :type="ATTENDANCE_TAG[row.status] || 'info'" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="備註" prop="remark" min-width="200">
              <template #default="{ row }">
                <span>{{ row.remark || '-' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ── 才藝報名 ── -->
        <el-tab-pane v-if="canReadActivity" label="才藝報名" name="registration">
          <el-empty v-if="!registrationsLoading && !registrations.length" description="尚無才藝報名紀錄" />
          <el-table
            v-else
            v-loading="registrationsLoading"
            :data="registrations"
            size="small"
            stripe
            max-height="560"
          >
            <el-table-column label="學期" width="140">
              <template #default="{ row }">{{ formatSemesterLabel(row) }}</template>
            </el-table-column>
            <el-table-column label="報名課程" min-width="200">
              <template #default="{ row }">
                <span>{{ row.course_names || '-' }}</span>
                <el-tag v-if="row.course_count" size="small" style="margin-left:6px">{{ row.course_count }}門</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="用品" width="80" align="center">
              <template #default="{ row }">
                <span v-if="row.supply_count">{{ row.supply_count }}</span>
                <span v-else class="sub">-</span>
              </template>
            </el-table-column>
            <el-table-column label="繳費" width="220">
              <template #default="{ row }">
                <el-tag :type="paymentStatusLabel(row).type" size="small">{{ paymentStatusLabel(row).label }}</el-tag>
                <span class="sub" style="margin-left:6px">
                  {{ row.paid_amount || 0 }} / {{ row.total_amount || 0 }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="備註" prop="remark" min-width="160">
              <template #default="{ row }">
                <span>{{ row.remark || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="報名時間" width="160">
              <template #default="{ row }">{{ formatTimestamp(row.created_at) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ── 學費繳費 ── -->
        <el-tab-pane v-if="canReadFees" label="學費繳費" name="fees">
          <div v-if="feeRecords.length" class="stat-row stat-row--top">
            <el-tag type="info" size="small">總應繳 {{ feeTotals.due }}</el-tag>
            <el-tag type="success" size="small">已收 {{ feeTotals.paid }}</el-tag>
            <el-tag type="danger" size="small">未繳筆數 {{ feeTotals.unpaid }}</el-tag>
            <el-tag type="warning" size="small">部分繳 {{ feeTotals.partial }}</el-tag>
          </div>
          <el-empty v-if="!feeRecordsLoading && !feeRecords.length" description="尚無學費紀錄" />
          <el-table
            v-else
            v-loading="feeRecordsLoading"
            :data="feeRecords"
            size="small"
            stripe
            max-height="560"
          >
            <el-table-column label="期別" prop="period" width="120" />
            <el-table-column label="費用項目" prop="fee_item_name" min-width="140" />
            <el-table-column label="班級" prop="classroom_name" width="110" />
            <el-table-column label="應繳" width="90" align="right">
              <template #default="{ row }">{{ row.amount_due || 0 }}</template>
            </el-table-column>
            <el-table-column label="已繳" width="90" align="right">
              <template #default="{ row }">{{ row.amount_paid || 0 }}</template>
            </el-table-column>
            <el-table-column label="狀態" width="90">
              <template #default="{ row }">
                <el-tag :type="FEE_STATUS_TYPE[row.status] || 'info'" size="small">
                  {{ FEE_STATUS_LABEL[row.status] || row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="繳費日" prop="payment_date" width="110">
              <template #default="{ row }">{{ row.payment_date || '-' }}</template>
            </el-table-column>
            <el-table-column label="付款方式" prop="payment_method" width="100">
              <template #default="{ row }">{{ row.payment_method || '-' }}</template>
            </el-table-column>
            <el-table-column label="備註" prop="notes" min-width="140">
              <template #default="{ row }">
                <span>{{ row.notes || '-' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ── 家長溝通 ── -->
        <el-tab-pane label="家長溝通" name="communications">
          <el-empty v-if="!communicationsLoading && !communications.length" description="尚無家長溝通紀錄" />
          <el-table
            v-else
            v-loading="communicationsLoading"
            :data="communications"
            size="small"
            stripe
            max-height="560"
          >
            <el-table-column label="日期" prop="communication_date" width="120" />
            <el-table-column label="方式" width="90">
              <template #default="{ row }">
                <el-tag :type="COMM_TYPE_TAG[row.communication_type] || 'info'" size="small">
                  {{ row.communication_type }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="主題" prop="topic" min-width="140">
              <template #default="{ row }">{{ row.topic || '-' }}</template>
            </el-table-column>
            <el-table-column label="內容" min-width="220">
              <template #default="{ row }">
                <el-tooltip :content="row.content || ''" placement="top" :show-after="500">
                  <span>{{ truncate(row.content || '') }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="後續追蹤" min-width="160">
              <template #default="{ row }">
                <el-tooltip v-if="row.follow_up" :content="row.follow_up" placement="top" :show-after="500">
                  <span>{{ truncate(row.follow_up) }}</span>
                </el-tooltip>
                <span v-else class="sub">-</span>
              </template>
            </el-table-column>
            <el-table-column v-if="canWriteStudents" label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text @click="openEditCommunication(row)">編輯</el-button>
                <el-button size="small" text type="danger" @click="handleDeleteCommunication(row)">刪除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

      </el-tabs>
    </div>

    <IncidentEditorDialog
      v-model:visible="incidentDialog.visible"
      :mode="incidentDialog.mode"
      :initial="incidentDialog.initial"
      :lock-student="true"
      :default-student-id="studentId"
      :default-classroom-id="classroomId"
      @submitted="fetchTimeline"
    />
    <AssessmentEditorDialog
      v-model:visible="assessmentDialog.visible"
      :mode="assessmentDialog.mode"
      :initial="assessmentDialog.initial"
      :lock-student="true"
      :default-student-id="studentId"
      :default-classroom-id="classroomId"
      @submitted="fetchTimeline"
    />
    <ChangeLogEditorDialog
      v-model:visible="changeLogDialog.visible"
      :mode="changeLogDialog.mode"
      :initial="changeLogDialog.initial"
      :lock-student="true"
      :default-student-id="studentId"
      @submitted="fetchTimeline"
    />
    <CommunicationEditorDialog
      v-model:visible="communicationDialog.visible"
      :mode="communicationDialog.mode"
      :initial="communicationDialog.initial"
      :default-student-id="studentId"
      @submitted="fetchCommunications"
    />
    <LifecycleTransitionDialog
      v-if="studentId"
      v-model="lifecycleDialogVisible"
      :student-id="studentId"
      :current-status="lifecycleCurrentStatus"
      @transitioned="onLifecycleTransitioned"
    />
  </el-dialog>
</template>

<style scoped>
.student-records-dialog :deep(.el-dialog__body) {
  padding: 16px 24px 24px;
  max-height: calc(90vh - 60px);
  overflow: hidden;
}
.quick-records { display: flex; flex-direction: column; }

.header-row {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; margin-bottom: 12px; flex-wrap: wrap;
  padding-bottom: 10px; border-bottom: 1px solid var(--el-border-color-lighter);
}
.header-left, .header-right {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
}
.chip {
  display: inline-block; padding: 2px 8px; border-radius: 4px;
  background: var(--el-fill-color-light); color: var(--el-text-color-secondary);
  font-size: 0.82rem;
}

.records-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }

.sub-filter-bar {
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
  margin-bottom: 14px;
}
.stat-row {
  display: flex; gap: 8px; flex-wrap: wrap;
  margin-left: auto;
}
.stat-row--top { margin-bottom: 12px; margin-left: 0; }

.timeline-wrap { max-height: 560px; overflow-y: auto; padding-right: 6px; }
.table-tabs :deep(.el-tabs__header) { margin-bottom: 8px; }

.record-card { padding: 4px 0; }
.record-head {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;
}
.record-actions { margin-left: auto; }
.record-body { color: var(--el-text-color-regular); line-height: 1.5; }
.sub { color: var(--el-text-color-secondary); font-size: 0.85em; }
</style>
