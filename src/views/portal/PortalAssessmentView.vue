<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMyClassAssessments, createPortalAssessment } from '@/api/studentAssessments'
import api from '@/api/index'

const ASSESSMENT_TYPES = ['期中', '期末', '學期']
const DOMAINS = ['身體動作與健康', '語文', '認知', '社會', '情緒', '美感', '綜合']
const RATINGS = ['優', '良', '需加強']

const RATING_TAG = {
  '優': 'success',
  '良': 'warning',
  '需加強': 'danger',
}

// ── 班級/學生 ─────────────────────────────────────────
const classrooms = ref([])      // [{ classroom_id, classroom_name, students: [...] }]
const activeClassroom = ref(null)
const classLoading = ref(false)

// ── 評量列表 ──────────────────────────────────────────
const assessments = ref([])
const total = ref(0)
const loading = ref(false)
const filterSemester = ref(null)
const filterType = ref(null)

// ── Dialog ────────────────────────────────────────────
const dialogVisible = ref(false)
const formLoading = ref(false)

const emptyForm = () => ({
  student_id: null,
  semester: '',
  assessment_type: '',
  domain: '',
  rating: '',
  content: '',
  suggestions: '',
  assessment_date: '',
})
const form = reactive(emptyForm())

const currentStudents = ref([])

const fetchMyStudents = async () => {
  classLoading.value = true
  try {
    const res = await api.get('/portal/my-students')
    classrooms.value = res.data.classrooms || []
    if (classrooms.value.length > 0) {
      activeClassroom.value = String(classrooms.value[0].classroom_id)
      currentStudents.value = classrooms.value[0].students || []
    }
  } catch {
    ElMessage.error('載入班級資料失敗')
  } finally {
    classLoading.value = false
  }
}

const onTabChange = (cid) => {
  const cr = classrooms.value.find(c => String(c.classroom_id) === cid)
  currentStudents.value = cr ? cr.students : []
  filterSemester.value = null
  filterType.value = null
  fetchAssessments()
}

const fetchAssessments = async () => {
  if (!activeClassroom.value) return
  loading.value = true
  try {
    const params = { classroom_id: Number(activeClassroom.value), limit: 100 }
    if (filterSemester.value) params.semester = filterSemester.value
    if (filterType.value) params.assessment_type = filterType.value
    const res = await getMyClassAssessments(params)
    assessments.value = res.data.items
    total.value = res.data.total
  } catch {
    ElMessage.error('載入評量記錄失敗')
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.student_id || !form.semester || !form.assessment_type || !form.content || !form.assessment_date) {
    ElMessage.warning('請填寫必填欄位（學生、學期、評量類型、評量內容、評量日期）')
    return
  }

  formLoading.value = true
  try {
    await createPortalAssessment({
      student_id: form.student_id,
      semester: form.semester,
      assessment_type: form.assessment_type,
      domain: form.domain || null,
      rating: form.rating || null,
      content: form.content,
      suggestions: form.suggestions || null,
      assessment_date: form.assessment_date,
    })
    ElMessage.success('新增成功')
    dialogVisible.value = false
    fetchAssessments()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '新增失敗')
  } finally {
    formLoading.value = false
  }
}

const truncate = (text, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

onMounted(async () => {
  await fetchMyStudents()
  fetchAssessments()
})
</script>

<template>
  <div>
    <div class="page-header">
      <h3>學期評量</h3>
      <el-button type="primary" size="small" @click="openCreate">＋ 新增評量</el-button>
    </div>

    <el-tabs
      v-if="classrooms.length > 0"
      v-model="activeClassroom"
      @tab-change="onTabChange"
      v-loading="classLoading"
    >
      <el-tab-pane
        v-for="cr in classrooms"
        :key="cr.classroom_id"
        :label="cr.classroom_name"
        :name="String(cr.classroom_id)"
      />
    </el-tabs>

    <!-- 篩選列 -->
    <el-row :gutter="12" style="margin-bottom: 16px">
      <el-col :xs="12" :sm="5">
        <el-input v-model="filterSemester" placeholder="學期（如 2025上）" clearable size="small" style="width: 100%" />
      </el-col>
      <el-col :xs="12" :sm="5">
        <el-select v-model="filterType" placeholder="評量類型" clearable size="small" style="width: 100%">
          <el-option v-for="t in ASSESSMENT_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
      </el-col>
      <el-col :xs="12" :sm="4">
        <el-button size="small" @click="fetchAssessments">查詢</el-button>
        <el-button size="small" @click="filterSemester = null; filterType = null; fetchAssessments()">重置</el-button>
      </el-col>
    </el-row>

    <!-- 評量表格 -->
    <el-table :data="assessments" v-loading="loading" stripe size="small">
      <el-table-column label="學生姓名" width="90" prop="student_name" />
      <el-table-column label="學期" width="80" prop="semester" />
      <el-table-column label="評量類型" width="80">
        <template #default="{ row }">
          <el-tag type="info" size="small">{{ row.assessment_type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="領域" width="120" prop="domain">
        <template #default="{ row }">
          <span v-if="row.domain">{{ row.domain }}</span>
          <span v-else style="color: #c0c4cc">-</span>
        </template>
      </el-table-column>
      <el-table-column label="評等" width="85">
        <template #default="{ row }">
          <el-tag v-if="row.rating" :type="RATING_TAG[row.rating]" size="small">{{ row.rating }}</el-tag>
          <span v-else style="color: #c0c4cc">-</span>
        </template>
      </el-table-column>
      <el-table-column label="評量內容" min-width="160">
        <template #default="{ row }">
          <el-tooltip :content="row.content" placement="top" :show-after="500">
            <span>{{ truncate(row.content) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="評量日期" width="100" prop="assessment_date" />
    </el-table>

    <div style="margin-top: 8px; font-size: 13px; color: #909399">
      共 {{ total }} 筆紀錄
    </div>

    <!-- 新增 Dialog -->
    <el-dialog v-model="dialogVisible" title="新增評量記錄" width="520px">
      <el-form label-width="100px">
        <el-form-item label="學生 *">
          <el-select v-model="form.student_id" placeholder="選擇學生" style="width: 100%">
            <el-option v-for="s in currentStudents" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學期 *">
          <el-input v-model="form.semester" placeholder="例：2025上" style="width: 100%" />
        </el-form-item>
        <el-form-item label="評量類型 *">
          <el-select v-model="form.assessment_type" placeholder="選擇類型" style="width: 100%">
            <el-option v-for="t in ASSESSMENT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="領域">
          <el-select v-model="form.domain" placeholder="選擇領域" clearable style="width: 100%">
            <el-option v-for="d in DOMAINS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="評等">
          <el-select v-model="form.rating" placeholder="選擇評等" clearable style="width: 100%">
            <el-option v-for="r in RATINGS" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="評量日期 *">
          <el-date-picker
            v-model="form.assessment_date"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="評量內容 *">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="4"
            placeholder="請描述評量觀察內容"
          />
        </el-form-item>
        <el-form-item label="改善建議">
          <el-input
            v-model="form.suggestions"
            type="textarea"
            :rows="2"
            placeholder="改善建議（選填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="formLoading" @click="submitForm">確認</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}
</style>
