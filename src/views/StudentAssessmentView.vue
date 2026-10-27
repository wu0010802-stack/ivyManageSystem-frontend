<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getAssessments, createAssessment, updateAssessment, deleteAssessment } from '@/api/studentAssessments'
import { useAllClassroomStore } from '@/stores/classroomAll'
import { labelClassroomsByTerm, type ClassroomLike } from '@/utils/classroomTerm'
import { getStudents } from '@/api/students'
import { ASSESSMENT_TYPES, DOMAINS, RATINGS, RATING_TAG } from '@/constants/studentRecords'
import { apiError } from '@/utils/error'
import { buildStudentProfileLink } from '@/utils/studentLinks'
import { hasPermission } from '@/utils/auth'
import { buildSemesterLabelOptions } from '@/utils/academic'
import { required } from '@/validators/rules'
import { useFormDirty } from '@/composables/useFormDirty'
import { useIsMobile } from '@/composables/useIsMobile'
import PageHeader from '@/components/common/PageHeader.vue'
import AdminCreateButton from '@/components/common/AdminCreateButton.vue'
import AdminListToolbar, { type FilterGroup } from '@/components/common/AdminListToolbar.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import FormDialog from '@/components/common/FormDialog.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

// 寫入控制守衛（防禦縱深；班級越權由後端 assert_student_access 把關）
const canWrite = computed(() => hasPermission('STUDENTS_WRITE'))
const { isMobile } = useIsMobile()

// ── 篩選 ────────────────────────────────────────────────
const classroomStore = useAllClassroomStore()
// 跨學期班級：dialog 會把既有紀錄的 classroom_id 塞回下拉，且「選班級→抓學生」
// 依賴這份清單。只給當期班級時，學生已編入下學年班級就整段斷掉（2026-07-30 根因）。
const classrooms = computed(() =>
  labelClassroomsByTerm(classroomStore.classrooms as ClassroomLike[]),
)
const filterClassroom = ref<number | null>(null)
const filterSemester = ref<string | null>(null)
const filterType = ref<string | null>(null)
const hasActiveFilter = computed(() =>
  Boolean(filterClassroom.value) || Boolean(filterSemester.value) || Boolean(filterType.value),
)

// semester 欄是字串，既有資料一律「民國學年＋上/下」（114上）；原本讓人自由輸入且提示
// 寫「2025上」，照提示打就篩不到。改成下拉，格式由 buildSemesterLabelOptions 決定。
const semesterOptions = computed(() => buildSemesterLabelOptions(undefined, 6, [form.semester]))

const typeFilterGroups: FilterGroup[] = [
  { key: 'type', label: '評量類型', options: ASSESSMENT_TYPES.map((t) => ({ label: t, value: t })) },
]
const toolbarFilterValues = computed(() => ({ type: filterType.value }))
const onToolbarFilters = (v: Record<string, unknown>) => {
  filterType.value = (v.type as string | null) || null
  handleSearch()
}

// ── 表格 ────────────────────────────────────────────────
const assessments = ref<Record<string, unknown>[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)

const assessmentCardColumns = [
  { label: '學期', prop: 'semester' },
  { label: '評量類型', prop: 'assessment_type' },
  { label: '領域', prop: 'domain', formatter: (r: Record<string, unknown>) => String(r.domain || '-') },
  { label: '評等', prop: '__rating' },
  { label: '評量日期', prop: 'assessment_date' },
  { label: '評量內容', prop: 'content', block: true },
]

// ── Dialog ──────────────────────────────────────────────
const dialogVisible = ref(false)
const dialogMode = ref('create') // 'create' | 'edit'
const formLoading = ref(false)
const formRef = ref<FormInstance>()
const formDialogRef = ref<InstanceType<typeof FormDialog>>()

const emptyForm = (): {
  student_id: number | null
  semester: string
  assessment_type: string
  domain: string
  rating: string
  content: string
  suggestions: string
  assessment_date: string
} => ({
  student_id: null,
  semester: buildSemesterLabelOptions(undefined, 1)[0],
  assessment_type: '',
  domain: '',
  rating: '',
  content: '',
  suggestions: '',
  assessment_date: '',
})

const form = reactive(emptyForm())
const editId = ref<number | null>(null)
const { isDirty, snapshot } = useFormDirty(form)

const formRules: FormRules = {
  student_id: [required('學生', { kind: 'select' })],
  semester: [required('學期', { kind: 'select' })],
  assessment_type: [required('評量類型', { kind: 'select' })],
  assessment_date: [required('評量日期', { kind: 'select' })],
  content: [required('評量內容')],
}

// 新增/編輯 Dialog 的班級/學生選擇
const dialogClassroom = ref<number | null>(null)
const dialogStudents = ref<{ id: number; name: string }[]>([])
const dialogStudentsLoading = ref(false)

const fetchAssessments = async () => {
  loading.value = true
  loadError.value = false
  try {
    const params: Record<string, unknown> = {
      skip: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
    }
    if (filterClassroom.value) params.classroom_id = filterClassroom.value
    if (filterSemester.value) params.semester = filterSemester.value
    if (filterType.value) params.assessment_type = filterType.value
    const res = await getAssessments(params)
    assessments.value = res.data.items
    total.value = res.data.total
  } catch (e) {
    // 清空並標記失敗，畫面顯示錯誤態而不是「尚無評量紀錄」
    loadError.value = true
    assessments.value = []
    total.value = 0
    ElMessage.error(friendlyError('載入評量記錄失敗', e))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  fetchAssessments()
}

const resetFilters = () => {
  filterClassroom.value = null
  filterSemester.value = null
  filterType.value = null
  handleSearch()
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchAssessments()
}

// 當 Dialog 班級改變時，載入學生
const onDialogClassroomChange = async (cid: number | null) => {
  form.student_id = null
  dialogStudents.value = []
  if (!cid) return
  dialogStudentsLoading.value = true
  try {
    const res = await getStudents({ classroom_id: cid, is_active: true, limit: 500 })
    dialogStudents.value = res.data.items || []
  } catch (e) {
    ElMessage.error(friendlyError('載入學生資料失敗', e))
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
  snapshot()
  dialogVisible.value = true
}

const openEdit = (row: Record<string, unknown>) => {
  Object.assign(form, {
    student_id: (row.student_id as number | null) ?? null,
    semester: String(row.semester ?? ''),
    assessment_type: String(row.assessment_type ?? ''),
    domain: String(row.domain ?? ''),
    rating: String(row.rating ?? ''),
    content: String(row.content ?? ''),
    suggestions: String(row.suggestions ?? ''),
    assessment_date: String(row.assessment_date ?? ''),
  })
  dialogClassroom.value = (row.classroom_id as number | null) ?? null
  dialogStudents.value = [{ id: row.student_id as number, name: String(row.student_name ?? '') }]
  editId.value = row.id as number | null
  dialogMode.value = 'edit'
  snapshot()
  dialogVisible.value = true
}

const submitForm = async () => {
  // 必填走 EP rules（欄位標紅＋捲到第一個錯誤欄），ref 未綁定視同驗證失敗（fail-closed）
  const valid = formRef.value ? await formRef.value.validate().catch(() => false) : false
  if (!valid) {
    formDialogRef.value?.scrollToFirstError()
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
      ElMessage.success('已建立評量記錄')
    } else {
      await updateAssessment(editId.value!, payload)
      ElMessage.success('已更新評量記錄')
    }
    dialogVisible.value = false
    fetchAssessments()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    formLoading.value = false
  }
}

const handleDelete = async (row: Record<string, unknown>) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${row.student_name}」的評量記錄嗎？刪除後無法復原。`,
      '確認刪除',
      { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' }
    )
    await deleteAssessment(row.id as number)
    ElMessage.success('已刪除')
    fetchAssessments()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

const truncate = (text: string | null | undefined, len = 60) => {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '…' : text
}

const ratingTagType = (rating: unknown): ElTagType =>
  (RATING_TAG as Record<string, string>)[String(rating)] as ElTagType

const emptyTitle = computed(() => (hasActiveFilter.value ? '目前篩選條件下沒有評量紀錄' : '尚無評量紀錄'))

onMounted(() => {
  classroomStore.fetchClassrooms()
  fetchAssessments()
})
</script>

<template>
  <div class="page-container">
    <PageHeader :title="PAGE_TERMS.studentAssessments">
      <template #actions>
        <AdminCreateButton v-if="canWrite" @click="openCreate">新增評量</AdminCreateButton>
      </template>
    </PageHeader>

    <AdminListToolbar
      :searchable="false"
      :filters="typeFilterGroups"
      :filter-values="toolbarFilterValues"
      :total="total"
      @update:filter-values="onToolbarFilters"
    >
      <template #actions>
        <el-select
          v-model="filterClassroom"
          placeholder="全部班級"
          clearable
          aria-label="篩選班級"
          class="filter-select"
          @change="handleSearch"
        >
          <el-option v-for="c in classrooms" :key="c.id" :label="c.label" :value="c.id" />
        </el-select>
        <el-select
          v-model="filterSemester"
          placeholder="全部學期"
          clearable
          aria-label="篩選學期"
          class="filter-select filter-select--short"
          @change="handleSearch"
        >
          <el-option v-for="s in semesterOptions" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button v-if="hasActiveFilter" @click="resetFilters">清除篩選</el-button>
      </template>
    </AdminListToolbar>

    <TableSkeleton v-if="loading && !assessments.length" :columns="7" />
    <EmptyState
      v-else-if="loadError"
      variant="error"
      title="評量紀錄載入失敗"
      description="請重新載入；在載入成功前請勿視為沒有紀錄。"
    >
      <template #action>
        <el-button type="primary" @click="fetchAssessments">重新載入</el-button>
      </template>
    </EmptyState>
    <template v-else>
      <el-table v-if="!isMobile" :data="assessments" v-loading="loading" stripe>
        <template #empty>
          <EmptyState
            :title="emptyTitle"
            :description="hasActiveFilter ? '試著調整班級、學期或評量類型' : ''"
            variant="inline"
          />
        </template>
        <el-table-column label="學生姓名" width="100">
          <template #default="{ row }">
            <router-link
              v-if="buildStudentProfileLink(row.student_id, 'records')"
              :to="buildStudentProfileLink(row.student_id, 'records')!"
              class="student-link"
            >{{ row.student_name }}</router-link>
            <span v-else>{{ row.student_name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="學期" width="90" prop="semester" />
        <el-table-column label="評量類型" width="90">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.assessment_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="領域" width="130" prop="domain">
          <template #default="{ row }">
            <span v-if="row.domain">{{ row.domain }}</span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="評等" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.rating" :type="ratingTagType(row.rating)" size="small">{{ row.rating }}</el-tag>
            <span v-else class="text-muted">-</span>
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
        <el-table-column v-if="canWrite" label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text @click="openEdit(row)">編輯</el-button>
            <el-button size="small" text type="danger" @click="handleDelete(row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <AdminListCards
        v-else
        :items="assessments"
        :columns="assessmentCardColumns"
        row-key="id"
        :loading="loading"
        :empty-text="emptyTitle"
      >
        <template #title="{ item }">
          <router-link
            v-if="buildStudentProfileLink(item.student_id as number, 'records')"
            :to="buildStudentProfileLink(item.student_id as number, 'records')!"
            class="student-link"
          >{{ item.student_name }}</router-link>
          <span v-else>{{ item.student_name }}</span>
        </template>
        <template #cell-__rating="{ item }">
          <el-tag v-if="item.rating" :type="ratingTagType(item.rating)" size="small">{{ item.rating }}</el-tag>
          <span v-else>-</span>
        </template>
        <template v-if="canWrite" #actions="{ item }">
          <el-button size="small" text @click="openEdit(item)">編輯</el-button>
          <el-button size="small" text type="danger" @click="handleDelete(item)">刪除</el-button>
        </template>
      </AdminListCards>

      <div v-if="total > pageSize" class="pagination-row">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </template>

    <!-- 新增/編輯 Dialog -->
    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增評量記錄' : '編輯評量記錄'"
      size="standardNarrow"
      :dirty="isDirty"
      :loading="formLoading"
      :submit-text="dialogMode === 'create' ? '建立評量記錄' : '儲存'"
      @submit="submitForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top" class="form-grid">
        <el-form-item label="班級" class="fg-6">
          <el-select
            v-model="dialogClassroom"
            placeholder="先選班級再選學生"
            @change="onDialogClassroomChange"
          >
            <el-option v-for="c in classrooms" :key="c.id" :label="c.label" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學生" prop="student_id" class="fg-6">
          <el-select
            v-model="form.student_id"
            :placeholder="dialogClassroom ? '選擇學生' : '請先選班級'"
            :disabled="!dialogClassroom"
            :loading="dialogStudentsLoading"
            filterable
          >
            <el-option v-for="s in dialogStudents" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="學期" prop="semester" class="fg-6">
          <el-select v-model="form.semester" placeholder="選擇學期">
            <el-option v-for="s in semesterOptions" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="評量日期" prop="assessment_date" class="fg-6">
          <el-date-picker
            v-model="form.assessment_date"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="評量類型" prop="assessment_type" class="fg-6">
          <el-select v-model="form.assessment_type" placeholder="選擇類型">
            <el-option v-for="t in ASSESSMENT_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="領域" class="fg-6">
          <el-select v-model="form.domain" placeholder="選擇領域（選填）" clearable>
            <el-option v-for="d in DOMAINS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="評等" class="fg-6">
          <el-select v-model="form.rating" placeholder="選擇評等（選填）" clearable>
            <el-option v-for="r in RATINGS" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="評量內容" prop="content" class="fg-12">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="4"
            placeholder="請描述評量觀察內容"
          />
        </el-form-item>
        <el-form-item label="改善建議" class="fg-12">
          <el-input
            v-model="form.suggestions"
            type="textarea"
            :rows="2"
            placeholder="改善建議（選填）"
          />
        </el-form-item>
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.page-container {
  padding: 0;
}
.filter-select {
  width: 200px;
}
.filter-select--short {
  width: 130px;
}
.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-4);
}
.text-muted {
  color: var(--neutral-300);
}
.student-link {
  color: var(--el-color-primary);
  text-decoration: none;
}
.student-link:hover {
  text-decoration: underline;
}
</style>
