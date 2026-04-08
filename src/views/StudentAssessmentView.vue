<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAssessments, createAssessment, updateAssessment, deleteAssessment } from '@/api/studentAssessments'
import { useClassroomStore } from '@/stores/classroom'
import { getStudents } from '@/api/students'
import { ASSESSMENT_TYPES, DOMAINS, RATINGS, RATING_TAG } from '@/constants/studentRecords'
import { apiError } from '@/utils/error'

// ── 篩選 ────────────────────────────────────────────────
const classroomStore = useClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)
const filterClassroom = ref(null)
const filterSemester = ref(null)
const filterType = ref(null)

// ── 表格 ────────────────────────────────────────────────
const assessments = ref([])
const total = ref(0)
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)

// ── Dialog ──────────────────────────────────────────────
const dialogVisible = ref(false)
const dialogMode = ref('create') // 'create' | 'edit'
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
const editId = ref(null)

// 新增/編輯 Dialog 的班級/學生選擇
const dialogClassroom = ref(null)
const dialogStudents = ref([])
const dialogStudentsLoading = ref(false)

const fetchAssessments = async () => {
  loading.value = true
  try {
    const params = {
      skip: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
    }
    if (filterClassroom.value) params.classroom_id = filterClassroom.value
    if (filterSemester.value) params.semester = filterSemester.value
    if (filterType.value) params.assessment_type = filterType.value
    const res = await getAssessments(params)
    assessments.value = res.data.items
    total.value = res.data.total
  } catch {
    ElMessage.error('載入評量記錄失敗')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  fetchAssessments()
}

const handlePageChange = (page) => {
  currentPage.value = page
  fetchAssessments()
}

// 當 Dialog 班級改變時，載入學生
const onDialogClassroomChange = async (cid) => {
  form.student_id = null
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

const openCreate = () => {
  Object.assign(form, emptyForm())
  dialogClassroom.value = null
  dialogStudents.value = []
  editId.value = null
  dialogMode.value = 'create'
  dialogVisible.value = true
}

const openEdit = (row) => {
  Object.assign(form, {
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
  editId.value = row.id
  dialogMode.value = 'edit'
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.student_id || !form.semester || !form.assessment_type || !form.content || !form.assessment_date) {
    ElMessage.warning('請填寫必填欄位（學生、學期、評量類型、評量內容、評量日期）')
    return
  }

  formLoading.value = true
  try {
    const payload = {
      student_id: form.student_id,
      semester: form.semester,
      assessment_type: form.assessment_type,
      domain: form.domain || null,
      rating: form.rating || null,
      content: form.content,
      suggestions: form.suggestions || null,
      assessment_date: form.assessment_date,
    }

    if (dialogMode.value === 'create') {
      await createAssessment(payload)
      ElMessage.success('新增成功')
    } else {
      await updateAssessment(editId.value, payload)
      ElMessage.success('更新成功')
    }
    dialogVisible.value = false
    fetchAssessments()
  } catch (e) {
    ElMessage.error(apiError(e, '操作失敗'))
  } finally {
    formLoading.value = false
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${row.student_name}」的評量記錄嗎？`,
      '確認刪除',
      { type: 'warning' }
    )
    await deleteAssessment(row.id)
    ElMessage.success('刪除成功')
    fetchAssessments()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const truncate = (text, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

onMounted(() => {
  classroomStore.fetchClassrooms()
  fetchAssessments()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>學期評量記錄</h2>
      <el-button type="primary" @click="openCreate">＋ 新增評量</el-button>
    </div>

    <!-- 篩選列 -->
    <el-card class="filter-card" shadow="never">
      <el-row :gutter="12" align="middle">
        <el-col :xs="24" :sm="5">
          <el-select v-model="filterClassroom" placeholder="篩選班級" clearable style="width: 100%">
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="5">
          <el-input v-model="filterSemester" placeholder="學期（如 2025上）" clearable style="width: 100%" />
        </el-col>
        <el-col :xs="24" :sm="5">
          <el-select v-model="filterType" placeholder="評量類型" clearable style="width: 100%">
            <el-option v-for="t in ASSESSMENT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="5">
          <el-button type="primary" @click="handleSearch">查詢</el-button>
          <el-button @click="filterClassroom = null; filterSemester = null; filterType = null; handleSearch()">重置</el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="never" style="margin-top: 16px">
      <el-table :data="assessments" v-loading="loading" stripe>
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
            <el-button size="small" text @click="openEdit(row)">編輯</el-button>
            <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="display: flex; justify-content: flex-end; margin-top: 16px">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 新增/編輯 Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增評量記錄' : '編輯評量記錄'"
      width="580px"
    >
      <el-form label-width="100px">
        <el-form-item label="班級">
          <el-select
            v-model="dialogClassroom"
            placeholder="選擇班級"
            @change="onDialogClassroomChange"
            style="width: 100%"
          >
            <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學生 *">
          <el-select
            v-model="form.student_id"
            placeholder="選擇學生"
            :loading="dialogStudentsLoading"
            style="width: 100%"
          >
            <el-option v-for="s in dialogStudents" :key="s.id" :label="s.name" :value="s.id" />
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
  margin-bottom: 0;
}
</style>
