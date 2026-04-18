<template>
  <div class="student-profile-view">
    <div class="page-header">
      <el-breadcrumb>
        <el-breadcrumb-item :to="{ path: '/students' }">學生管理</el-breadcrumb-item>
        <el-breadcrumb-item>學生檔案</el-breadcrumb-item>
      </el-breadcrumb>
      <div class="header-actions">
        <el-button @click="$router.back()">返回</el-button>
        <el-button
          v-if="canLifecycleWrite"
          type="primary"
          :disabled="!profile"
          @click="lifecycleDialogVisible = true"
        >
          變更生命週期狀態
        </el-button>
      </div>
    </div>

    <el-card v-loading="loading" class="summary-card">
      <template v-if="profile">
        <div class="summary-head">
          <div class="name-block">
            <h2 class="student-name">{{ profile.basic.name }}</h2>
            <span class="student-id">#{{ profile.basic.student_id }}</span>
            <el-tag :type="lifecycleTagType" size="small" style="margin-left: 8px">
              {{ lifecycleLabel }}
            </el-tag>
          </div>
          <div class="meta">
            <span>班級：{{ profile.basic.classroom_name || '未分班' }}</span>
            <span>入學：{{ profile.lifecycle.enrollment_date || '—' }}</span>
            <span v-if="profile.lifecycle.graduation_date">畢業：{{ profile.lifecycle.graduation_date }}</span>
            <span v-if="profile.lifecycle.withdrawal_date">離園：{{ profile.lifecycle.withdrawal_date }}</span>
          </div>
        </div>

        <el-row :gutter="12" class="summary-row">
          <el-col :xs="12" :sm="8" :md="6">
            <div class="summary-stat">
              <div class="stat-label">本學期出席紀錄</div>
              <div class="stat-value">{{ profile.attendance_summary.total_records }}</div>
              <div class="stat-sub">
                出席 {{ attendanceCount('出席') }}・缺席 {{ attendanceCount('缺席') }}・
                病假 {{ attendanceCount('病假') }}・事假 {{ attendanceCount('事假') }}
              </div>
            </div>
          </el-col>
          <el-col :xs="12" :sm="8" :md="6">
            <div class="summary-stat">
              <div class="stat-label">費用應繳</div>
              <div class="stat-value">${{ profile.fee_summary.total_due }}</div>
              <div class="stat-sub">
                已繳 ${{ profile.fee_summary.total_paid }}・未繳 ${{ profile.fee_summary.outstanding }}
              </div>
            </div>
          </el-col>
          <el-col :xs="12" :sm="8" :md="6">
            <div class="summary-stat">
              <div class="stat-label">監護人</div>
              <div class="stat-value">{{ profile.guardians.length }}</div>
              <div class="stat-sub">
                {{ primaryGuardianLabel }}
              </div>
            </div>
          </el-col>
          <el-col :xs="12" :sm="8" :md="6">
            <div class="summary-stat">
              <div class="stat-label">最近事件</div>
              <div class="stat-value">{{ profile.incident_summary.length }}</div>
              <div class="stat-sub">
                {{ latestIncidentLabel }}
              </div>
            </div>
          </el-col>
        </el-row>
      </template>
    </el-card>

    <el-tabs v-if="profile" v-model="activeTab" class="profile-tabs">
      <el-tab-pane label="基本資料" name="basic">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="姓名">{{ profile.basic.name }}</el-descriptions-item>
          <el-descriptions-item label="學號">{{ profile.basic.student_id }}</el-descriptions-item>
          <el-descriptions-item label="性別">{{ profile.basic.gender || '—' }}</el-descriptions-item>
          <el-descriptions-item label="生日">{{ profile.basic.birthday || '—' }}</el-descriptions-item>
          <el-descriptions-item label="班級">{{ profile.basic.classroom_name || '未分班' }}</el-descriptions-item>
          <el-descriptions-item label="是否在籍">
            <el-tag :type="profile.basic.is_active ? 'success' : 'info'" size="small">
              {{ profile.basic.is_active ? '在籍' : '已離園' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="地址" :span="2">{{ profile.basic.address || '—' }}</el-descriptions-item>
          <el-descriptions-item label="備註" :span="2">{{ profile.basic.notes || '—' }}</el-descriptions-item>
        </el-descriptions>

        <h3 class="section-title">健康資訊</h3>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="過敏">{{ profile.health.allergy || '—' }}</el-descriptions-item>
          <el-descriptions-item label="用藥">{{ profile.health.medication || '—' }}</el-descriptions-item>
          <el-descriptions-item label="特殊需求" :span="2">
            {{ profile.health.special_needs || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="緊急聯絡人">
            {{ profile.health.emergency_contact_name || '—' }}
            <span v-if="profile.health.emergency_contact_relation">
              ({{ profile.health.emergency_contact_relation }})
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="緊急聯絡電話">
            {{ profile.health.emergency_contact_phone || '—' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <el-tab-pane label="監護人" name="guardians">
        <GuardianManager
          v-if="canGuardiansRead && profile"
          :student-id="profile.basic.id"
          @change="fetchProfile"
        />
        <el-empty v-else description="您沒有檢視監護人資料的權限" />
      </el-tab-pane>

      <el-tab-pane label="事件" name="incidents">
        <div class="tab-header">
          <el-button type="primary" size="small" @click="openIncidentCreate">＋ 新增事件</el-button>
        </div>
        <el-table :data="incidentList" v-loading="incidentLoading" border empty-text="無事件紀錄">
          <el-table-column label="發生時間" width="170">
            <template #default="{ row }">{{ formatTs(row.occurred_at) }}</template>
          </el-table-column>
          <el-table-column label="類型" prop="incident_type" width="110" />
          <el-table-column label="嚴重程度" prop="severity" width="100" />
          <el-table-column label="描述" prop="description" min-width="200" show-overflow-tooltip />
          <el-table-column label="已通知家長" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.parent_notified ? 'success' : 'info'" size="small">
                {{ row.parent_notified ? '已通知' : '未通知' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text @click="openIncidentEdit(row)">編輯</el-button>
              <el-button size="small" text type="danger" @click="handleIncidentDelete(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="評量" name="assessments">
        <div class="tab-header">
          <el-button type="primary" size="small" @click="openAssessmentCreate">＋ 新增評量</el-button>
        </div>
        <el-table :data="assessmentList" v-loading="assessmentLoading" border empty-text="無評量紀錄">
          <el-table-column label="評量日期" prop="assessment_date" width="110" />
          <el-table-column label="學期" prop="semester" width="100" />
          <el-table-column label="類型" prop="assessment_type" width="90" />
          <el-table-column label="領域" prop="domain" width="130" />
          <el-table-column label="評等" prop="rating" width="80" />
          <el-table-column label="內容" prop="content" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text @click="openAssessmentEdit(row)">編輯</el-button>
              <el-button size="small" text type="danger" @click="handleAssessmentDelete(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="異動" name="change_logs">
        <div class="tab-header">
          <el-select v-model="changeLogTermKey" style="width: 200px">
            <el-option
              v-for="t in changeLogTermOptions"
              :key="t.key"
              :label="t.label"
              :value="t.key"
            />
          </el-select>
          <el-button type="primary" size="small" @click="openChangeLogCreate">＋ 新增異動</el-button>
        </div>
        <el-table :data="changeLogList" v-loading="changeLogLoading" border empty-text="無異動紀錄">
          <el-table-column label="異動日期" prop="event_date" width="110" />
          <el-table-column label="異動類型" prop="event_type" width="100" />
          <el-table-column label="原因" prop="reason" width="130" />
          <el-table-column label="備註" prop="notes" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text @click="openChangeLogEdit(row)">編輯</el-button>
              <el-button size="small" text type="danger" @click="handleChangeLogDelete(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="完整時間軸" name="timeline">
        <el-timeline v-if="mergedTimeline.length > 0">
          <el-timeline-item
            v-for="item in mergedTimeline"
            :key="`${item.record_type || 'legacy'}-${item.record_id || item.id}`"
            :timestamp="item.occurred_at || item.event_date"
            :type="timelineItemColor(item)"
            placement="top"
          >
            <el-card shadow="never">
              <div class="timeline-head">
                <el-tag :type="timelineItemColor(item)" size="small">
                  {{ timelineItemLabel(item) }}
                </el-tag>
                <span v-if="item.summary" class="timeline-reason">{{ item.summary }}</span>
              </div>
              <div v-if="item.payload?.notes || item.payload?.reason || item.payload?.description || item.payload?.content" class="timeline-notes">
                {{ item.payload?.notes || item.payload?.reason || item.payload?.description || item.payload?.content }}
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="尚無紀錄" />
      </el-tab-pane>

      <el-tab-pane label="相關連結" name="links">
        <div class="quick-links">
          <el-button @click="goTo('/student-attendance')">學生出席紀錄</el-button>
          <el-button @click="goTo('/fees')">學費管理</el-button>
          <el-button @click="goTo('/student-records')">學生紀錄總覽</el-button>
          <el-button @click="goTo('/students')">回到學生列表</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 本檔案專用的三個 Editor Dialog（鎖學生）-->
    <IncidentEditorDialog
      v-if="profile"
      v-model:visible="incidentDialog.visible"
      :mode="incidentDialog.mode"
      :initial="incidentDialog.initial"
      :lock-student="true"
      :default-student-id="profile.basic.id"
      :default-classroom-id="profile.basic.classroom_id"
      @submitted="fetchIncidents"
    />
    <AssessmentEditorDialog
      v-if="profile"
      v-model:visible="assessmentDialog.visible"
      :mode="assessmentDialog.mode"
      :initial="assessmentDialog.initial"
      :lock-student="true"
      :default-student-id="profile.basic.id"
      :default-classroom-id="profile.basic.classroom_id"
      @submitted="fetchAssessments"
    />
    <ChangeLogEditorDialog
      v-if="profile"
      v-model:visible="changeLogDialog.visible"
      :mode="changeLogDialog.mode"
      :initial="changeLogDialog.initial"
      :lock-student="true"
      :default-student-id="profile.basic.id"
      :default-term-key="changeLogTermKey"
      @submitted="fetchChangeLogs"
    />

    <LifecycleTransitionDialog
      v-if="profile"
      v-model="lifecycleDialogVisible"
      :student-id="profile.basic.id"
      :current-status="profile.lifecycle.status"
      @transitioned="fetchProfile"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import GuardianManager from '@/components/student/GuardianManager.vue'
import LifecycleTransitionDialog from '@/components/student/LifecycleTransitionDialog.vue'
import IncidentEditorDialog from '@/components/student/IncidentEditorDialog.vue'
import AssessmentEditorDialog from '@/components/student/AssessmentEditorDialog.vue'
import ChangeLogEditorDialog from '@/components/student/ChangeLogEditorDialog.vue'
import { getStudentProfile } from '@/api/students'
import { getIncidents, deleteIncident } from '@/api/studentIncidents'
import { getAssessments, deleteAssessment } from '@/api/studentAssessments'
import { getChangeLogs, deleteChangeLog } from '@/api/studentChangeLogs'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'

const route = useRoute()
const router = useRouter()

const profile = ref(null)
const loading = ref(false)
const activeTab = ref('basic')
const lifecycleDialogVisible = ref(false)

const studentId = computed(() => Number(route.params.id))
const canLifecycleWrite = computed(() => hasPermission('STUDENTS_LIFECYCLE_WRITE'))
const canGuardiansRead = computed(() => hasPermission('GUARDIANS_READ'))

// ── 事件紀錄（本學生） ──────────────────────────────
const incidentList = ref([])
const incidentLoading = ref(false)
const incidentDialog = reactive({ visible: false, mode: 'create', initial: null })

const fetchIncidents = async () => {
  if (!studentId.value) return
  incidentLoading.value = true
  try {
    const res = await getIncidents({ student_id: studentId.value, limit: 200 })
    incidentList.value = res.data.items || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入事件紀錄失敗'))
  } finally {
    incidentLoading.value = false
  }
}
const openIncidentCreate = () => {
  incidentDialog.initial = null
  incidentDialog.mode = 'create'
  incidentDialog.visible = true
}
const openIncidentEdit = (row) => {
  incidentDialog.initial = { ...row, student_name: profile.value?.basic.name }
  incidentDialog.mode = 'edit'
  incidentDialog.visible = true
}
const handleIncidentDelete = async (row) => {
  try {
    await ElMessageBox.confirm('確定刪除此筆事件紀錄？', '確認刪除', { type: 'warning' })
    await deleteIncident(row.id)
    ElMessage.success('刪除成功')
    fetchIncidents()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

// ── 學期評量（本學生） ──────────────────────────────
const assessmentList = ref([])
const assessmentLoading = ref(false)
const assessmentDialog = reactive({ visible: false, mode: 'create', initial: null })

const fetchAssessments = async () => {
  if (!studentId.value) return
  assessmentLoading.value = true
  try {
    const res = await getAssessments({ student_id: studentId.value, limit: 200 })
    assessmentList.value = res.data.items || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入評量紀錄失敗'))
  } finally {
    assessmentLoading.value = false
  }
}
const openAssessmentCreate = () => {
  assessmentDialog.initial = null
  assessmentDialog.mode = 'create'
  assessmentDialog.visible = true
}
const openAssessmentEdit = (row) => {
  assessmentDialog.initial = { ...row, student_name: profile.value?.basic.name }
  assessmentDialog.mode = 'edit'
  assessmentDialog.visible = true
}
const handleAssessmentDelete = async (row) => {
  try {
    await ElMessageBox.confirm('確定刪除此筆評量？', '確認刪除', { type: 'warning' })
    await deleteAssessment(row.id)
    ElMessage.success('刪除成功')
    fetchAssessments()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

// ── 異動紀錄（本學生，依學期）──────────────────────
const currentTerm = getCurrentAcademicTerm()
const changeLogTermKey = ref(`${currentTerm.school_year}-${currentTerm.semester}`)
const changeLogList = ref([])
const changeLogLoading = ref(false)
const changeLogDialog = reactive({ visible: false, mode: 'create', initial: null })

const changeLogTermOptions = computed(() => {
  const opts = []
  let sy = currentTerm.school_year
  let s = currentTerm.semester
  for (let i = 0; i < 6; i++) {
    opts.push({
      key: `${sy}-${s}`,
      label: `${sy}學年度 ${s === 1 ? '上學期' : '下學期'}`,
    })
    if (s === 1) { s = 2; sy -= 1 } else { s = 1 }
  }
  return opts
})

const fetchChangeLogs = async () => {
  if (!studentId.value) return
  changeLogLoading.value = true
  try {
    const [sy, sem] = changeLogTermKey.value.split('-').map(Number)
    const res = await getChangeLogs({
      student_id: studentId.value,
      school_year: sy,
      semester: sem,
      page_size: 100,
    })
    changeLogList.value = res.data.items || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入異動紀錄失敗'))
  } finally {
    changeLogLoading.value = false
  }
}
const openChangeLogCreate = () => {
  changeLogDialog.initial = null
  changeLogDialog.mode = 'create'
  changeLogDialog.visible = true
}
const openChangeLogEdit = (row) => {
  changeLogDialog.initial = { ...row, student_name: profile.value?.basic.name }
  changeLogDialog.mode = 'edit'
  changeLogDialog.visible = true
}
const handleChangeLogDelete = async (row) => {
  try {
    await ElMessageBox.confirm('確定刪除此筆異動紀錄？', '確認刪除', { type: 'warning' })
    await deleteChangeLog(row.id)
    ElMessage.success('刪除成功')
    fetchChangeLogs()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

watch(changeLogTermKey, () => fetchChangeLogs())

// 當使用者切到特定 tab 時才載入該資料（延遲載入）
watch(activeTab, (v) => {
  if (v === 'incidents' && incidentList.value.length === 0) fetchIncidents()
  if (v === 'assessments' && assessmentList.value.length === 0) fetchAssessments()
  if (v === 'change_logs' && changeLogList.value.length === 0) fetchChangeLogs()
})

// ── 合併時間軸（優先用後端 timeline_all，fallback 用 timeline）
const mergedTimeline = computed(() => {
  const p = profile.value
  if (!p) return []
  if (Array.isArray(p.timeline_all) && p.timeline_all.length > 0) return p.timeline_all
  return p.timeline || []
})

function timelineItemLabel(item) {
  if (item.record_type === 'incident') return item.payload?.incident_type || '事件'
  if (item.record_type === 'assessment') return item.payload?.assessment_type || '評量'
  if (item.record_type === 'change_log') return item.payload?.event_type || '異動'
  // 舊格式 fallback
  return item.event_type || '紀錄'
}

function timelineItemColor(item) {
  if (item.record_type === 'incident') return 'danger'
  if (item.record_type === 'assessment') return 'success'
  if (item.record_type === 'change_log') return timelineColor(item.payload?.event_type)
  return timelineColor(item.event_type)
}

function formatTs(iso) {
  if (!iso) return '-'
  const s = String(iso)
  return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s
}

const LIFECYCLE_LABELS = {
  prospect: '招生中',
  enrolled: '已報到',
  active: '在學',
  on_leave: '休學',
  transferred: '轉出',
  withdrawn: '退學',
  graduated: '畢業',
}
const LIFECYCLE_TAG = {
  prospect: 'info',
  enrolled: 'warning',
  active: 'success',
  on_leave: 'warning',
  transferred: 'info',
  withdrawn: 'danger',
  graduated: 'success',
}
const EVENT_COLOR = {
  入學: 'success',
  復學: 'success',
  休學: 'warning',
  退學: 'danger',
  轉出: 'info',
  轉入: 'primary',
  畢業: 'success',
}

const lifecycleLabel = computed(() =>
  LIFECYCLE_LABELS[profile.value?.lifecycle.status] || profile.value?.lifecycle.status || '',
)
const lifecycleTagType = computed(() =>
  LIFECYCLE_TAG[profile.value?.lifecycle.status] || 'info',
)
const primaryGuardianLabel = computed(() => {
  const primary = profile.value?.guardians?.find((g) => g.is_primary)
  return primary ? `主要：${primary.name}` : '尚無主要聯絡人'
})
const latestIncidentLabel = computed(() => {
  const first = profile.value?.incident_summary?.[0]
  return first ? `最近：${first.incident_type}` : '無紀錄'
})

function attendanceCount(status) {
  return profile.value?.attendance_summary?.by_status?.[status] || 0
}

function timelineColor(eventType) {
  return EVENT_COLOR[eventType] || 'info'
}

function goTo(path) {
  router.push(path)
}

async function fetchProfile() {
  if (!studentId.value || Number.isNaN(studentId.value)) return
  loading.value = true
  try {
    const { data } = await getStudentProfile(studentId.value)
    profile.value = data
  } catch (err) {
    ElMessage.error(err.displayMessage || '讀取學生檔案失敗')
    profile.value = null
  } finally {
    loading.value = false
  }
}

onMounted(fetchProfile)
watch(studentId, fetchProfile)
</script>

<style scoped>
.student-profile-view {
  padding: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.summary-card {
  margin-bottom: 16px;
}
.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}
.name-block {
  display: flex;
  align-items: center;
  gap: 10px;
}
.student-name {
  margin: 0;
  font-size: 22px;
}
.student-id {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.meta {
  display: flex;
  gap: 16px;
  color: var(--el-text-color-regular);
  flex-wrap: wrap;
}
.summary-row {
  margin-top: 4px;
}
.summary-stat {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  background: var(--el-fill-color-blank);
  margin-bottom: 10px;
}
.stat-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
  margin: 4px 0;
}
.stat-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.profile-tabs {
  margin-top: 4px;
}
.section-title {
  margin-top: 16px;
  font-size: 16px;
}
.timeline-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.timeline-reason {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
.timeline-notes {
  color: var(--el-text-color-primary);
  font-size: 13px;
  margin-bottom: 4px;
}
.timeline-meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.quick-links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
