<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getIncidents, createIncident, updateIncident, deleteIncident } from '@/api/studentIncidents'
import { getAssessments, createAssessment, updateAssessment, deleteAssessment } from '@/api/studentAssessments'
import { useClassroomStore } from '@/stores/classroom'
import { getStudents } from '@/api/students'
import {
  INCIDENT_TYPES, SEVERITIES, INCIDENT_TYPE_TAG as TYPE_TAG, SEVERITY_TAG,
  ASSESSMENT_TYPES, DOMAINS, RATINGS, RATING_TAG,
} from '@/constants/studentRecords'
import { apiError } from '@/utils/error'

// ── 共用：班級 & Dialog 學生選擇 ──────────────────────────
const classroomStore = useClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)
const dialogClassroom = ref(null)
const dialogStudents = ref([])
const dialogStudentsLoading = ref(false)

const onDialogClassroomChange = async (cid) => {
  incForm.student_id = null
  asmForm.student_id = null
  dialogStudents.value = []
  if (!cid) return
  dialogStudentsLoading.value = true
  try {
    const res = await getStudents({ classroom_id: cid, is_active: true })
    dialogStudents.value = res.data.items || []
  } catch {
    ElMessage.error('載入學生資料失敗')
  } finally {
    dialogStudentsLoading.value = false
  }
}

const truncate = (text, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

// ═══════════════════════════════════════════════════════════
// 學生事件紀錄
// ═══════════════════════════════════════════════════════════

const incFilterClassroom = ref(null)
const incFilterType = ref(null)
const incFilterDateRange = ref([])

const incidents = ref([])
const incTotal = ref(0)
const incLoading = ref(false)
const incCurrentPage = ref(1)
const incPageSize = ref(20)

const incDialogVisible = ref(false)
const incDialogMode = ref('create')
const incFormLoading = ref(false)
const incEditId = ref(null)

const emptyIncForm = () => ({
  student_id: null,
  incident_type: '',
  severity: '',
  occurred_at: '',
  description: '',
  action_taken: '',
  parent_notified: false,
})
const incForm = reactive(emptyIncForm())

const fetchIncidents = async () => {
  incLoading.value = true
  try {
    const params = { skip: (incCurrentPage.value - 1) * incPageSize.value, limit: incPageSize.value }
    if (incFilterClassroom.value) params.classroom_id = incFilterClassroom.value
    if (incFilterType.value) params.incident_type = incFilterType.value
    if (incFilterDateRange.value?.length === 2) {
      params.start_date = incFilterDateRange.value[0]
      params.end_date = incFilterDateRange.value[1]
    }
    const res = await getIncidents(params)
    incidents.value = res.data.items
    incTotal.value = res.data.total
  } catch {
    ElMessage.error('載入事件紀錄失敗')
  } finally {
    incLoading.value = false
  }
}

const incHandleSearch = () => { incCurrentPage.value = 1; fetchIncidents() }
const incHandlePageChange = (page) => { incCurrentPage.value = page; fetchIncidents() }

const openCreateIncident = () => {
  Object.assign(incForm, emptyIncForm())
  dialogClassroom.value = null
  dialogStudents.value = []
  incEditId.value = null
  incDialogMode.value = 'create'
  incDialogVisible.value = true
}

const openEditIncident = (row) => {
  Object.assign(incForm, {
    student_id: row.student_id,
    incident_type: row.incident_type,
    severity: row.severity || '',
    occurred_at: row.occurred_at ? row.occurred_at.slice(0, 16) : '',
    description: row.description,
    action_taken: row.action_taken || '',
    parent_notified: row.parent_notified,
  })
  dialogClassroom.value = row.classroom_id
  dialogStudents.value = [{ id: row.student_id, name: row.student_name }]
  incEditId.value = row.id
  incDialogMode.value = 'edit'
  incDialogVisible.value = true
}

const submitIncidentForm = async () => {
  if (!incForm.student_id || !incForm.incident_type || !incForm.occurred_at || !incForm.description) {
    ElMessage.warning('請填寫必填欄位（學生、類型、發生時間、描述）')
    return
  }
  incFormLoading.value = true
  try {
    const payload = {
      student_id: incForm.student_id,
      incident_type: incForm.incident_type,
      severity: incForm.severity || null,
      occurred_at: incForm.occurred_at,
      description: incForm.description,
      action_taken: incForm.action_taken || null,
      parent_notified: incForm.parent_notified,
    }
    if (incDialogMode.value === 'create') {
      await createIncident(payload)
      ElMessage.success('新增成功')
    } else {
      await updateIncident(incEditId.value, payload)
      ElMessage.success('更新成功')
    }
    incDialogVisible.value = false
    fetchIncidents()
  } catch (e) {
    ElMessage.error(apiError(e, '操作失敗'))
  } finally {
    incFormLoading.value = false
  }
}

const toggleParentNotified = async (row) => {
  const newVal = !row.parent_notified
  try {
    await updateIncident(row.id, {
      parent_notified: newVal,
      parent_notified_at: newVal ? new Date().toISOString() : null,
    })
    row.parent_notified = newVal
    row.parent_notified_at = newVal ? new Date().toISOString() : null
    ElMessage.success(newVal ? '已標記通知家長' : '已取消通知標記')
  } catch {
    ElMessage.error('更新失敗')
  }
}

const handleDeleteIncident = async (row) => {
  try {
    await ElMessageBox.confirm(`確定要刪除「${row.student_name}」的事件紀錄嗎？`, '確認刪除', { type: 'warning' })
    await deleteIncident(row.id)
    ElMessage.success('刪除成功')
    fetchIncidents()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

// ═══════════════════════════════════════════════════════════
// 學期評量記錄
// ═══════════════════════════════════════════════════════════

const asmFilterClassroom = ref(null)
const asmFilterSemester = ref(null)
const asmFilterType = ref(null)

const assessments = ref([])
const asmTotal = ref(0)
const asmLoading = ref(false)
const asmCurrentPage = ref(1)
const asmPageSize = ref(20)

const asmDialogVisible = ref(false)
const asmDialogMode = ref('create')
const asmFormLoading = ref(false)
const asmEditId = ref(null)

const emptyAsmForm = () => ({
  student_id: null,
  semester: '',
  assessment_type: '',
  domain: '',
  rating: '',
  content: '',
  suggestions: '',
  assessment_date: '',
})
const asmForm = reactive(emptyAsmForm())

const fetchAssessments = async () => {
  asmLoading.value = true
  try {
    const params = { skip: (asmCurrentPage.value - 1) * asmPageSize.value, limit: asmPageSize.value }
    if (asmFilterClassroom.value) params.classroom_id = asmFilterClassroom.value
    if (asmFilterSemester.value) params.semester = asmFilterSemester.value
    if (asmFilterType.value) params.assessment_type = asmFilterType.value
    const res = await getAssessments(params)
    assessments.value = res.data.items
    asmTotal.value = res.data.total
  } catch {
    ElMessage.error('載入評量記錄失敗')
  } finally {
    asmLoading.value = false
  }
}

const asmHandleSearch = () => { asmCurrentPage.value = 1; fetchAssessments() }
const asmHandlePageChange = (page) => { asmCurrentPage.value = page; fetchAssessments() }

const openCreateAssessment = () => {
  Object.assign(asmForm, emptyAsmForm())
  dialogClassroom.value = null
  dialogStudents.value = []
  asmEditId.value = null
  asmDialogMode.value = 'create'
  asmDialogVisible.value = true
}

const openEditAssessment = (row) => {
  Object.assign(asmForm, {
    student_id: row.student_id,
    semester: row.semester || '',
    assessment_type: row.assessment_type || '',
    domain: row.domain || '',
    rating: row.rating || '',
    content: row.content || '',
    suggestions: row.suggestions || '',
    assessment_date: row.assessment_date || '',
  })
  dialogClassroom.value = row.classroom_id
  dialogStudents.value = [{ id: row.student_id, name: row.student_name }]
  asmEditId.value = row.id
  asmDialogMode.value = 'edit'
  asmDialogVisible.value = true
}

const submitAssessmentForm = async () => {
  if (!asmForm.student_id || !asmForm.semester || !asmForm.assessment_type || !asmForm.content || !asmForm.assessment_date) {
    ElMessage.warning('請填寫必填欄位（學生、學期、評量類型、評量內容、評量日期）')
    return
  }
  asmFormLoading.value = true
  try {
    const payload = {
      student_id: asmForm.student_id,
      semester: asmForm.semester,
      assessment_type: asmForm.assessment_type,
      domain: asmForm.domain || null,
      rating: asmForm.rating || null,
      content: asmForm.content,
      suggestions: asmForm.suggestions || null,
      assessment_date: asmForm.assessment_date,
    }
    if (asmDialogMode.value === 'create') {
      await createAssessment(payload)
      ElMessage.success('新增成功')
    } else {
      await updateAssessment(asmEditId.value, payload)
      ElMessage.success('更新成功')
    }
    asmDialogVisible.value = false
    fetchAssessments()
  } catch (e) {
    ElMessage.error(apiError(e, '操作失敗'))
  } finally {
    asmFormLoading.value = false
  }
}

const handleDeleteAssessment = async (row) => {
  try {
    await ElMessageBox.confirm(`確定要刪除「${row.student_name}」的評量記錄嗎？`, '確認刪除', { type: 'warning' })
    await deleteAssessment(row.id)
    ElMessage.success('刪除成功')
    fetchAssessments()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

// ── 初始化 ───────────────────────────────────────────────
onMounted(() => {
  classroomStore.fetchClassrooms()
  fetchIncidents()
  fetchAssessments()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>學生紀錄</h2>
    </div>

    <el-tabs type="border-card">
      <!-- ════════════════ 事件紀錄 Tab ════════════════ -->
      <el-tab-pane label="事件紀錄">
        <div class="tab-header">
          <el-button type="primary" @click="openCreateIncident">＋ 新增事件</el-button>
        </div>

        <el-card class="filter-card" shadow="never">
          <el-row :gutter="12" align="middle">
            <el-col :xs="24" :sm="6">
              <el-select v-model="incFilterClassroom" placeholder="篩選班級" clearable style="width: 100%">
                <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-col>
            <el-col :xs="24" :sm="5">
              <el-select v-model="incFilterType" placeholder="事件類型" clearable style="width: 100%">
                <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
              </el-select>
            </el-col>
            <el-col :xs="24" :sm="8">
              <el-date-picker
                v-model="incFilterDateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="開始日期"
                end-placeholder="結束日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-col>
            <el-col :xs="24" :sm="5">
              <el-button type="primary" @click="incHandleSearch">查詢</el-button>
              <el-button @click="incFilterClassroom = null; incFilterType = null; incFilterDateRange = []; incHandleSearch()">重置</el-button>
            </el-col>
          </el-row>
        </el-card>

        <el-card shadow="never" style="margin-top: 16px">
          <el-table :data="incidents" v-loading="incLoading" stripe>
            <el-table-column label="發生時間" width="155" prop="occurred_at">
              <template #default="{ row }">
                {{ row.occurred_at ? row.occurred_at.slice(0, 16).replace('T', ' ') : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="學生姓名" width="100" prop="student_name" />
            <el-table-column label="事件類型" width="100">
              <template #default="{ row }">
                <el-tag :type="TYPE_TAG[row.incident_type]" size="small">{{ row.incident_type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="嚴重程度" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.severity" :type="SEVERITY_TAG[row.severity]" size="small">{{ row.severity }}</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="事件描述" min-width="180">
              <template #default="{ row }">
                <el-tooltip :content="row.description" placement="top" :show-after="500">
                  <span>{{ truncate(row.description) }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="通知家長" width="90" align="center">
              <template #default="{ row }">
                <el-switch :model-value="row.parent_notified" @change="toggleParentNotified(row)" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text @click="openEditIncident(row)">編輯</el-button>
                <el-button size="small" text type="danger" @click="handleDeleteIncident(row)">刪除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div style="display: flex; justify-content: flex-end; margin-top: 16px">
            <el-pagination
              v-model:current-page="incCurrentPage"
              :page-size="incPageSize"
              :total="incTotal"
              layout="total, prev, pager, next"
              @current-change="incHandlePageChange"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <!-- ════════════════ 評量紀錄 Tab ════════════════ -->
      <el-tab-pane label="學期評量">
        <div class="tab-header">
          <el-button type="primary" @click="openCreateAssessment">＋ 新增評量</el-button>
        </div>

        <el-card class="filter-card" shadow="never">
          <el-row :gutter="12" align="middle">
            <el-col :xs="24" :sm="5">
              <el-select v-model="asmFilterClassroom" placeholder="篩選班級" clearable style="width: 100%">
                <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-col>
            <el-col :xs="24" :sm="5">
              <el-input v-model="asmFilterSemester" placeholder="學期（如 2025上）" clearable style="width: 100%" />
            </el-col>
            <el-col :xs="24" :sm="5">
              <el-select v-model="asmFilterType" placeholder="評量類型" clearable style="width: 100%">
                <el-option v-for="t in ASSESSMENT_TYPES" :key="t" :label="t" :value="t" />
              </el-select>
            </el-col>
            <el-col :xs="24" :sm="5">
              <el-button type="primary" @click="asmHandleSearch">查詢</el-button>
              <el-button @click="asmFilterClassroom = null; asmFilterSemester = null; asmFilterType = null; asmHandleSearch()">重置</el-button>
            </el-col>
          </el-row>
        </el-card>

        <el-card shadow="never" style="margin-top: 16px">
          <el-table :data="assessments" v-loading="asmLoading" stripe>
            <el-table-column label="學生姓名" width="100" prop="student_name" />
            <el-table-column label="學期" width="90" prop="semester" />
            <el-table-column label="評量類型" width="90">
              <template #default="{ row }">
                <el-tag type="info" size="small">{{ row.assessment_type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="領域" width="130" prop="domain">
              <template #default="{ row }">
                <span v-if="row.domain">{{ row.domain }}</span>
                <span v-else style="color: #c0c4cc">-</span>
              </template>
            </el-table-column>
            <el-table-column label="評等" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.rating" :type="RATING_TAG[row.rating]" size="small">{{ row.rating }}</el-tag>
                <span v-else style="color: #c0c4cc">-</span>
              </template>
            </el-table-column>
            <el-table-column label="評量內容" min-width="180">
              <template #default="{ row }">
                <el-tooltip :content="row.content" placement="top" :show-after="500">
                  <span>{{ truncate(row.content) }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="評量日期" width="110" prop="assessment_date" />
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text @click="openEditAssessment(row)">編輯</el-button>
                <el-button size="small" text type="danger" @click="handleDeleteAssessment(row)">刪除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div style="display: flex; justify-content: flex-end; margin-top: 16px">
            <el-pagination
              v-model:current-page="asmCurrentPage"
              :page-size="asmPageSize"
              :total="asmTotal"
              layout="total, prev, pager, next"
              @current-change="asmHandlePageChange"
            />
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 事件紀錄 Dialog -->
    <el-dialog
      v-model="incDialogVisible"
      :title="incDialogMode === 'create' ? '新增事件紀錄' : '編輯事件紀錄'"
      width="560px"
    >
      <el-form label-width="90px">
        <el-form-item label="班級">
          <el-select v-model="dialogClassroom" placeholder="選擇班級" @change="onDialogClassroomChange" style="width: 100%">
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學生 *">
          <el-select v-model="incForm.student_id" placeholder="選擇學生" :loading="dialogStudentsLoading" style="width: 100%">
            <el-option v-for="s in dialogStudents" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="事件類型 *">
          <el-select v-model="incForm.incident_type" placeholder="選擇類型" style="width: 100%">
            <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="嚴重程度">
          <el-select v-model="incForm.severity" placeholder="選擇嚴重程度" clearable style="width: 100%">
            <el-option v-for="s in SEVERITIES" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="發生時間 *">
          <el-date-picker
            v-model="incForm.occurred_at"
            type="datetime"
            placeholder="選擇日期時間"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="事件描述 *">
          <el-input v-model="incForm.description" type="textarea" :rows="3" placeholder="請描述事件經過" />
        </el-form-item>
        <el-form-item label="處置方式">
          <el-input v-model="incForm.action_taken" type="textarea" :rows="2" placeholder="已採取的處置措施" />
        </el-form-item>
        <el-form-item label="通知家長">
          <el-checkbox v-model="incForm.parent_notified">已通知家長</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="incDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="incFormLoading" @click="submitIncidentForm">確認</el-button>
      </template>
    </el-dialog>

    <!-- 評量記錄 Dialog -->
    <el-dialog
      v-model="asmDialogVisible"
      :title="asmDialogMode === 'create' ? '新增評量記錄' : '編輯評量記錄'"
      width="580px"
    >
      <el-form label-width="100px">
        <el-form-item label="班級">
          <el-select v-model="dialogClassroom" placeholder="選擇班級" @change="onDialogClassroomChange" style="width: 100%">
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學生 *">
          <el-select v-model="asmForm.student_id" placeholder="選擇學生" :loading="dialogStudentsLoading" style="width: 100%">
            <el-option v-for="s in dialogStudents" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學期 *">
          <el-input v-model="asmForm.semester" placeholder="例：2025上" style="width: 100%" />
        </el-form-item>
        <el-form-item label="評量類型 *">
          <el-select v-model="asmForm.assessment_type" placeholder="選擇類型" style="width: 100%">
            <el-option v-for="t in ASSESSMENT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="領域">
          <el-select v-model="asmForm.domain" placeholder="選擇領域" clearable style="width: 100%">
            <el-option v-for="d in DOMAINS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="評等">
          <el-select v-model="asmForm.rating" placeholder="選擇評等" clearable style="width: 100%">
            <el-option v-for="r in RATINGS" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="評量日期 *">
          <el-date-picker
            v-model="asmForm.assessment_date"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="評量內容 *">
          <el-input v-model="asmForm.content" type="textarea" :rows="4" placeholder="請描述評量觀察內容" />
        </el-form-item>
        <el-form-item label="改善建議">
          <el-input v-model="asmForm.suggestions" type="textarea" :rows="2" placeholder="改善建議（選填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="asmDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="asmFormLoading" @click="submitAssessmentForm">確認</el-button>
      </template>
    </el-dialog>
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
.tab-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}
.filter-card {
  margin-bottom: 0;
}
</style>
