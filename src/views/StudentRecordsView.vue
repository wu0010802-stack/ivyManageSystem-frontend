<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { getStudentRecordsTimeline } from '@/api/studentRecords'
import { deleteIncident } from '@/api/studentIncidents'
import { deleteAssessment } from '@/api/studentAssessments'
import { deleteChangeLog } from '@/api/studentChangeLogs'
import { getStudents } from '@/api/students'
import { useClassroomStore } from '@/stores/classroom'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { apiError } from '@/utils/error'

import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_TAG,
  SEVERITY_TAG,
  RATING_TAG,
} from '@/constants/studentRecords'

import IncidentEditorDialog from '@/components/student/IncidentEditorDialog.vue'
import AssessmentEditorDialog from '@/components/student/AssessmentEditorDialog.vue'
import ChangeLogEditorDialog from '@/components/student/ChangeLogEditorDialog.vue'

const router = useRouter()
const classroomStore = useClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)

// ── 篩選器 ──────────────────────────────────────────
const currentTerm = getCurrentAcademicTerm()

const filters = reactive({
  types: ['incident', 'assessment', 'change_log'],
  classroom_id: null,
  student_id: null,
  date_from: null,
  date_to: null,
  // 學期（僅影響 change_log）
  school_year: currentTerm.school_year,
  semester: currentTerm.semester,
})

const TYPE_OPTIONS = [
  { value: 'incident', label: '事件' },
  { value: 'assessment', label: '評量' },
  { value: 'change_log', label: '異動' },
]

const TYPE_TAG_COLOR = {
  incident: 'danger',
  assessment: 'success',
  change_log: 'warning',
}

const TYPE_LABEL = {
  incident: '事件',
  assessment: '評量',
  change_log: '異動',
}

const viewMode = ref('timeline') // 'timeline' | 'table'
const activeTableTab = ref('incident')
const dateRange = ref([])

// ── 學生下拉（依班級動態載入）──────────────────────
const classroomStudents = ref([])
const classroomStudentsLoading = ref(false)

watch(
  () => filters.classroom_id,
  async (cid) => {
    filters.student_id = null
    if (!cid) { classroomStudents.value = []; return }
    classroomStudentsLoading.value = true
    try {
      const res = await getStudents({ classroom_id: cid, is_active: true })
      classroomStudents.value = res.data.items || []
    } catch {
      classroomStudents.value = []
    } finally {
      classroomStudentsLoading.value = false
    }
  }
)

// ── 資料載入 ──────────────────────────────────────
const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

const fetchTimeline = async () => {
  loading.value = true
  try {
    const params = {
      page: page.value,
      page_size: pageSize.value,
    }
    if (filters.types?.length && filters.types.length < TYPE_OPTIONS.length) {
      params.type = filters.types
    }
    if (filters.classroom_id) params.classroom_id = filters.classroom_id
    if (filters.student_id) params.student_id = filters.student_id
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    // term 僅影響 change_log
    if (filters.types?.includes('change_log')) {
      if (filters.school_year) params.school_year = filters.school_year
      if (filters.semester) params.semester = filters.semester
    }
    const res = await getStudentRecordsTimeline(params)
    items.value = res.data.items
    total.value = res.data.total
  } catch (e) {
    ElMessage.error(apiError(e, '載入學生紀錄失敗'))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => { page.value = 1; fetchTimeline() }
const handleReset = () => {
  filters.types = ['incident', 'assessment', 'change_log']
  filters.classroom_id = null
  filters.student_id = null
  filters.date_from = null
  filters.date_to = null
  filters.school_year = currentTerm.school_year
  filters.semester = currentTerm.semester
  dateRange.value = []
  page.value = 1
  fetchTimeline()
}

// 按類型分組（table 模式用）
const groupedItems = computed(() => {
  const groups = { incident: [], assessment: [], change_log: [] }
  for (const it of items.value) {
    if (groups[it.record_type]) groups[it.record_type].push(it)
  }
  return groups
})

// ── Dialog 狀態 ──────────────────────────────────────
const incidentDialog = reactive({ visible: false, mode: 'create', initial: null })
const assessmentDialog = reactive({ visible: false, mode: 'create', initial: null })
const changeLogDialog = reactive({ visible: false, mode: 'create', initial: null })

const openCreate = (type) => {
  if (type === 'incident') {
    incidentDialog.initial = null
    incidentDialog.mode = 'create'
    incidentDialog.visible = true
  } else if (type === 'assessment') {
    assessmentDialog.initial = null
    assessmentDialog.mode = 'create'
    assessmentDialog.visible = true
  } else if (type === 'change_log') {
    changeLogDialog.initial = null
    changeLogDialog.mode = 'create'
    changeLogDialog.visible = true
  }
}

const openEdit = (row) => {
  // row 來自聚合端點，payload 內含原始欄位
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

const handleDelete = async (row) => {
  const msg = `確定要刪除「${row.student_name}」的這筆${TYPE_LABEL[row.record_type]}紀錄？`
  try {
    await ElMessageBox.confirm(msg, '確認刪除', { type: 'warning' })
    if (row.record_type === 'incident') await deleteIncident(row.record_id)
    else if (row.record_type === 'assessment') await deleteAssessment(row.record_id)
    else if (row.record_type === 'change_log') await deleteChangeLog(row.record_id)
    ElMessage.success('刪除成功')
    fetchTimeline()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const goToProfile = (row) => {
  router.push(`/students/profile/${row.student_id}`)
}

// ── 格式化顯示 ──────────────────────────────────────
const formatTimestamp = (iso) => {
  if (!iso) return '-'
  const s = String(iso)
  return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s
}

const truncate = (text, len = 80) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

// ── 初始化 ──────────────────────────────────────────
onMounted(() => {
  classroomStore.fetchClassrooms()
  fetchTimeline()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>學生紀錄</h2>
      <el-dropdown trigger="click" @command="openCreate">
        <el-button type="primary">＋ 新增紀錄 ▾</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="incident">事件紀錄</el-dropdown-item>
            <el-dropdown-item command="assessment">學期評量</el-dropdown-item>
            <el-dropdown-item command="change_log">異動紀錄</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 篩選列 -->
    <el-card class="filter-card" shadow="never">
      <el-row :gutter="12" align="middle" class="filter-row">
        <el-col :xs="24" :sm="12" :md="6">
          <el-select
            v-model="filters.types"
            multiple
            collapse-tags
            placeholder="紀錄類型"
            style="width: 100%"
          >
            <el-option
              v-for="t in TYPE_OPTIONS"
              :key="t.value"
              :label="t.label"
              :value="t.value"
            />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="12" :md="5">
          <el-select
            v-model="filters.classroom_id"
            placeholder="篩選班級"
            clearable
            style="width: 100%"
          >
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="12" :md="5">
          <el-select
            v-model="filters.student_id"
            placeholder="篩選學生"
            clearable
            :disabled="!filters.classroom_id"
            :loading="classroomStudentsLoading"
            style="width: 100%"
          >
            <el-option
              v-for="s in classroomStudents"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="24" :md="8">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="開始日期"
            end-placeholder="結束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
            @change="(v) => { filters.date_from = v?.[0] || null; filters.date_to = v?.[1] || null }"
          />
        </el-col>
      </el-row>
      <el-row :gutter="12" align="middle" class="filter-row">
        <el-col :xs="24" :sm="12" :md="6" v-if="filters.types.includes('change_log')">
          <el-input-number
            v-model="filters.school_year"
            :min="100"
            :max="200"
            placeholder="學年（僅影響異動）"
            style="width: 100%"
          />
        </el-col>
        <el-col :xs="24" :sm="12" :md="4" v-if="filters.types.includes('change_log')">
          <el-select v-model="filters.semester" placeholder="學期" style="width: 100%">
            <el-option :label="'上學期'" :value="1" />
            <el-option :label="'下學期'" :value="2" />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="24" :md="8">
          <el-radio-group v-model="viewMode">
            <el-radio-button label="timeline">時間軸</el-radio-button>
            <el-radio-button label="table">分類表格</el-radio-button>
          </el-radio-group>
        </el-col>
        <el-col :xs="24" :sm="24" :md="6" class="filter-actions">
          <el-button type="primary" @click="handleSearch">查詢</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- Timeline 模式 -->
    <el-card v-if="viewMode === 'timeline'" shadow="never" class="content-card" v-loading="loading">
      <div v-if="!items.length" class="empty-hint">尚無紀錄</div>
      <el-timeline v-else>
        <el-timeline-item
          v-for="row in items"
          :key="`${row.record_type}-${row.record_id}`"
          :timestamp="formatTimestamp(row.occurred_at)"
          :type="TYPE_TAG_COLOR[row.record_type]"
          placement="top"
        >
          <div class="timeline-card">
            <div class="timeline-row-head">
              <el-tag :type="TYPE_TAG_COLOR[row.record_type]" size="small">
                {{ TYPE_LABEL[row.record_type] }}
              </el-tag>
              <span class="student-chip">{{ row.student_name }}</span>
              <span v-if="row.classroom_name" class="classroom-chip">{{ row.classroom_name }}</span>
              <!-- 事件專屬 badge -->
              <el-tag
                v-if="row.record_type === 'incident' && row.payload?.incident_type"
                :type="INCIDENT_TYPE_TAG[row.payload.incident_type]"
                size="small"
              >
                {{ row.payload.incident_type }}
              </el-tag>
              <el-tag
                v-if="row.record_type === 'incident' && row.severity"
                :type="SEVERITY_TAG[row.severity]"
                size="small"
              >
                {{ row.severity }}
              </el-tag>
              <el-tag v-if="row.record_type === 'incident' && row.parent_notified" type="success" size="small">
                已通知家長
              </el-tag>
              <!-- 評量專屬 badge -->
              <el-tag v-if="row.record_type === 'assessment' && row.payload?.domain" type="info" size="small">
                {{ row.payload.domain }}
              </el-tag>
              <el-tag
                v-if="row.record_type === 'assessment' && row.payload?.rating"
                :type="RATING_TAG[row.payload.rating]"
                size="small"
              >
                {{ row.payload.rating }}
              </el-tag>
              <!-- 異動專屬 badge -->
              <el-tag v-if="row.record_type === 'change_log' && row.payload?.event_type" type="warning" size="small">
                {{ row.payload.event_type }}
              </el-tag>
            </div>
            <div class="timeline-body">
              {{ truncate(row.summary || row.payload?.description || row.payload?.content || '') }}
            </div>
            <div class="timeline-actions">
              <el-button size="small" text @click="goToProfile(row)">檔案</el-button>
              <el-button size="small" text @click="openEdit(row)">編輯</el-button>
              <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="fetchTimeline"
        />
      </div>
    </el-card>

    <!-- Table 模式：分類顯示 -->
    <el-card v-else shadow="never" class="content-card" v-loading="loading">
      <el-tabs v-model="activeTableTab">
        <el-tab-pane label="事件" name="incident">
          <el-table :data="groupedItems.incident" stripe>
            <el-table-column label="發生時間" width="155">
              <template #default="{ row }">{{ formatTimestamp(row.occurred_at) }}</template>
            </el-table-column>
            <el-table-column label="學生" width="110" prop="student_name" />
            <el-table-column label="班級" width="110" prop="classroom_name" />
            <el-table-column label="類型" width="100">
              <template #default="{ row }">
                <el-tag :type="INCIDENT_TYPE_TAG[row.payload?.incident_type]" size="small">
                  {{ row.payload?.incident_type }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="嚴重程度" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.severity" :type="SEVERITY_TAG[row.severity]" size="small">
                  {{ row.severity }}
                </el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="描述" min-width="200">
              <template #default="{ row }">
                <el-tooltip :content="row.payload?.description || ''" placement="top" :show-after="500">
                  <span>{{ truncate(row.payload?.description || '') }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="家長" width="80" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.parent_notified" size="small" type="success">已通知</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text @click="goToProfile(row)">檔案</el-button>
                <el-button size="small" text @click="openEdit(row)">編輯</el-button>
                <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="評量" name="assessment">
          <el-table :data="groupedItems.assessment" stripe>
            <el-table-column label="日期" width="110">
              <template #default="{ row }">{{ row.payload?.assessment_date || '-' }}</template>
            </el-table-column>
            <el-table-column label="學生" width="110" prop="student_name" />
            <el-table-column label="班級" width="110" prop="classroom_name" />
            <el-table-column label="學期" width="100">
              <template #default="{ row }">{{ row.payload?.semester || '-' }}</template>
            </el-table-column>
            <el-table-column label="評量類型" width="90">
              <template #default="{ row }">
                <el-tag type="info" size="small">{{ row.payload?.assessment_type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="領域" width="130">
              <template #default="{ row }">{{ row.payload?.domain || '-' }}</template>
            </el-table-column>
            <el-table-column label="評等" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.payload?.rating" :type="RATING_TAG[row.payload.rating]" size="small">
                  {{ row.payload.rating }}
                </el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="內容" min-width="200">
              <template #default="{ row }">
                <el-tooltip :content="row.payload?.content || ''" placement="top" :show-after="500">
                  <span>{{ truncate(row.payload?.content || '') }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text @click="goToProfile(row)">檔案</el-button>
                <el-button size="small" text @click="openEdit(row)">編輯</el-button>
                <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="異動" name="change_log">
          <el-table :data="groupedItems.change_log" stripe>
            <el-table-column label="異動日期" width="110">
              <template #default="{ row }">{{ row.payload?.event_date || '-' }}</template>
            </el-table-column>
            <el-table-column label="學生" width="110" prop="student_name" />
            <el-table-column label="班級" width="110" prop="classroom_name" />
            <el-table-column label="異動類型" width="100">
              <template #default="{ row }">
                <el-tag type="warning" size="small">{{ row.payload?.event_type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="原因" width="130">
              <template #default="{ row }">{{ row.payload?.reason || '-' }}</template>
            </el-table-column>
            <el-table-column label="備註" min-width="180">
              <template #default="{ row }">
                <el-tooltip :content="row.payload?.notes || ''" placement="top" :show-after="500">
                  <span>{{ truncate(row.payload?.notes || '') }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text @click="goToProfile(row)">檔案</el-button>
                <el-button size="small" text @click="openEdit(row)">編輯</el-button>
                <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="fetchTimeline"
        />
      </div>
    </el-card>

    <!-- Editor Dialogs -->
    <IncidentEditorDialog
      v-model:visible="incidentDialog.visible"
      :mode="incidentDialog.mode"
      :initial="incidentDialog.initial"
      :classrooms="classrooms"
      @submitted="fetchTimeline"
    />
    <AssessmentEditorDialog
      v-model:visible="assessmentDialog.visible"
      :mode="assessmentDialog.mode"
      :initial="assessmentDialog.initial"
      :classrooms="classrooms"
      @submitted="fetchTimeline"
    />
    <ChangeLogEditorDialog
      v-model:visible="changeLogDialog.visible"
      :mode="changeLogDialog.mode"
      :initial="changeLogDialog.initial"
      @submitted="fetchTimeline"
    />
  </div>
</template>

<style scoped>
.page-container {
  padding: 0;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
}
.filter-card {
  margin-bottom: 14px;
}
.filter-row {
  margin-bottom: 8px;
}
.filter-row:last-child {
  margin-bottom: 0;
}
.filter-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.content-card {
  min-height: 300px;
}
.empty-hint {
  text-align: center;
  color: #a3a3a3;
  padding: 40px 0;
}
.timeline-card {
  background: #fafafa;
  border-radius: 6px;
  padding: 10px 14px;
}
.timeline-row-head {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.timeline-body {
  margin-top: 6px;
  color: #374151;
  line-height: 1.6;
}
.timeline-actions {
  display: flex;
  gap: 2px;
  margin-top: 6px;
}
.student-chip {
  font-weight: 600;
  color: #1f2937;
}
.classroom-chip {
  color: #64748b;
  font-size: 13px;
}
.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
