<script setup>
import { onMounted, reactive, ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  createClassroom,
  deleteClassroom,
  getClassroom,
  getClassrooms,
  getGrades,
  promoteAcademicYear,
  getTeacherOptions,
  updateClassroom,
  cloneClassroomsToTerm,
} from '@/api/classrooms'
import { getCurrentAcademicTerm, normalizeSchoolYear, buildSchoolYearOptions } from '@/utils/academic'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, RefreshRight } from '@element-plus/icons-vue'
import { useClassroomStore } from '@/stores/classroom'
import { hasPermission } from '@/utils/auth'

const classroomStore = useClassroomStore()
const router = useRouter()
const currentAcademicTerm = getCurrentAcademicTerm()
const classrooms = ref([])
const grades = ref([])
const teachers = ref([])
const availableSchoolYears = ref([])
const loading = ref(false)
const cloneTermDialogVisible = ref(false)
const cloneTermLoading = ref(false)
const cloneTermForm = reactive({
  source_school_year: currentAcademicTerm.school_year,
  source_semester: currentAcademicTerm.semester,
  target_school_year: currentAcademicTerm.school_year,
  target_semester: currentAcademicTerm.semester === 1 ? 2 : 1,
  copy_teachers: true,
})
const detailLoading = ref(false)
const dialogVisible = ref(false)
const promotionDialogVisible = ref(false)
const promotionLoading = ref(false)
const promotionRows = ref([])
const formRef = ref(null)
const isEdit = ref(false)
const showInactive = ref(false)
const currentClassroom = ref(null)
const classroomDrawerVisible = ref(false)
const classroomDrawerLoading = ref(false)
const drawerClassroom = ref(null)
const canWrite = hasPermission('CLASSROOMS_WRITE')
const canReadStudents = hasPermission('STUDENTS_READ')
const canWriteStudents = hasPermission('STUDENTS_WRITE')
const filterSchoolYear = ref(currentAcademicTerm.school_year)
const filterSemester = ref(currentAcademicTerm.semester)
const semesterOptions = [
  { label: '上學期（8 月 - 1 月）', value: 1 },
  { label: '下學期（2 月 - 7 月）', value: 2 },
]
const schoolYearOptions = computed(() => {
  const years = new Set(buildSchoolYearOptions(currentAcademicTerm.school_year))
  availableSchoolYears.value.forEach((year) => years.add(Number(year)))
  classrooms.value.forEach((item) => item.school_year && years.add(Number(item.school_year)))
  years.add(normalizeSchoolYear(filterSchoolYear.value))
  return Array.from(years).sort((a, b) => b - a)
})
const nextAcademicTerm = (schoolYear, semester) => (
  semester === 1
    ? { school_year: schoolYear, semester: 2 }
    : { school_year: schoolYear + 1, semester: 1 }
)
const sortedGrades = computed(() =>
  [...grades.value].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
)
const isGraduationRow = (row) => !row.target_grade_id
const promotionForm = reactive({
  source_school_year: currentAcademicTerm.school_year,
  source_semester: currentAcademicTerm.semester,
  target_school_year: nextAcademicTerm(currentAcademicTerm.school_year, currentAcademicTerm.semester).school_year,
  target_semester: nextAcademicTerm(currentAcademicTerm.school_year, currentAcademicTerm.semester).semester,
})

const form = reactive({
  id: null,
  name: '',
  class_code: '',
  school_year: currentAcademicTerm.school_year,
  semester: currentAcademicTerm.semester,
  grade_id: null,
  capacity: 30,
  head_teacher_id: null,
  assistant_teacher_id: null,
  english_teacher_id: null,
  is_active: true,
})

const rules = {
  name: [{ required: true, message: '請輸入班級名稱', trigger: 'blur' }],
  capacity: [{ required: true, message: '請輸入班級容量', trigger: 'change' }],
}

const dialogTitle = computed(() => (isEdit.value ? '編輯班級' : '新增班級'))
const getStudentPreview = (classroom) => classroom.student_preview || []
const getRemainingStudentCount = (classroom) => Math.max(
  0,
  (classroom.current_count || 0) - getStudentPreview(classroom).length,
)

const getCapacityStatus = (classroom) => {
  const count = classroom.current_count || 0
  const capacity = classroom.capacity || 1
  if (count >= capacity) return 'full'
  if (count >= capacity * 0.9) return 'warning'
  return 'normal'
}

const resetForm = () => {
  form.id = null
  form.name = ''
  form.class_code = ''
  form.school_year = currentAcademicTerm.school_year
  form.semester = currentAcademicTerm.semester
  form.grade_id = null
  form.capacity = 30
  form.head_teacher_id = null
  form.assistant_teacher_id = null
  form.english_teacher_id = null
  form.is_active = true
  currentClassroom.value = null
}

const fetchClassrooms = async () => {
  loading.value = true
  try {
    const response = await getClassrooms({
      include_inactive: showInactive.value,
      school_year: normalizeSchoolYear(filterSchoolYear.value),
      semester: filterSemester.value,
    })
    classrooms.value = response.data
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入班級資料失敗')
  } finally {
    loading.value = false
  }
}

const fetchAvailableSchoolYears = async () => {
  try {
    const response = await getClassrooms({
      include_inactive: true,
      current_only: false,
    })
    availableSchoolYears.value = [...new Set(
      (response.data || [])
        .map((item) => Number(item.school_year))
        .filter((year) => Number.isFinite(year)),
    )]
  } catch {
    availableSchoolYears.value = []
  }
}

const fetchOptions = async () => {
  try {
    const [gradesRes, teachersRes] = await Promise.all([
      getGrades(),
      getTeacherOptions(),
    ])
    grades.value = gradesRes.data
    teachers.value = teachersRes.data
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入班級選項失敗')
  }
}

const populateForm = (data) => {
  form.id = data.id
  form.name = data.name || ''
  form.class_code = data.class_code || ''
  form.school_year = data.school_year
  form.semester = data.semester
  form.grade_id = data.grade_id || null
  form.capacity = data.capacity || 30
  form.head_teacher_id = data.head_teacher_id || null
  form.assistant_teacher_id = data.assistant_teacher_id || null
  form.english_teacher_id = data.english_teacher_id ?? data.art_teacher_id ?? null
  form.is_active = data.is_active ?? true
}

const openCreate = async () => {
  resetForm()
  isEdit.value = false
  await fetchOptions()
  dialogVisible.value = true
}

const openStudentDrawer = async (classroom) => {
  if (!canReadStudents) {
    if (canWrite) await openEdit(classroom)
    return
  }
  classroomDrawerVisible.value = true
  classroomDrawerLoading.value = true
  try {
    const response = await getClassroom(classroom.id)
    drawerClassroom.value = response.data
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入班級學生資料失敗')
  } finally {
    classroomDrawerLoading.value = false
  }
}

const closeStudentDrawer = () => {
  classroomDrawerVisible.value = false
}

const goToStudentManagement = async (classroom, action = null) => {
  const query = {
    school_year: String(classroom.school_year),
    semester: String(classroom.semester),
    classroom_id: String(classroom.id),
  }
  if (action) query.action = action
  await router.push({ path: '/students', query })
}

const openEdit = async (classroom) => {
  detailLoading.value = true
  try {
    await fetchOptions()
    const response = await getClassroom(classroom.id)
    currentClassroom.value = response.data
    populateForm(response.data)
    isEdit.value = true
    dialogVisible.value = true
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入班級詳情失敗')
  } finally {
    detailLoading.value = false
  }
}

const closeDialog = () => {
  dialogVisible.value = false
}

const shouldAdvanceGrade = () => (
  promotionForm.source_semester === 2
  && promotionForm.target_semester === 1
  && normalizeSchoolYear(promotionForm.target_school_year) > normalizeSchoolYear(promotionForm.source_school_year)
)

const findNextGradeId = (gradeId) => {
  if (!shouldAdvanceGrade()) return gradeId
  const currentIndex = sortedGrades.value.findIndex((grade) => grade.id === gradeId)
  if (currentIndex < 0) return null
  return sortedGrades.value[currentIndex - 1]?.id ?? null
}

const loadPromotionRows = async () => {
  promotionLoading.value = true
  try {
    const response = await getClassrooms({
      school_year: normalizeSchoolYear(promotionForm.source_school_year),
      semester: promotionForm.source_semester,
      include_inactive: false,
    })
    promotionRows.value = (response.data || []).map((classroom) => ({
      source_classroom_id: classroom.id,
      source_name: classroom.name,
      source_grade_id: classroom.grade_id,
      source_grade_name: classroom.grade_name || '未設定年級',
      target_name: findNextGradeId(classroom.grade_id) ? classroom.name : '',
      target_grade_id: findNextGradeId(classroom.grade_id),
      copy_teachers: true,
      move_students: true,
    }))
  } catch (error) {
    promotionRows.value = []
    ElMessage.error(error.response?.data?.detail || '載入升班資料失敗')
  } finally {
    promotionLoading.value = false
  }
}

const openPromotionDialog = async () => {
  await fetchOptions()
  await fetchAvailableSchoolYears()
  promotionForm.source_school_year = normalizeSchoolYear(filterSchoolYear.value)
  promotionForm.source_semester = filterSemester.value
  const nextTerm = nextAcademicTerm(promotionForm.source_school_year, promotionForm.source_semester)
  promotionForm.target_school_year = nextTerm.school_year
  promotionForm.target_semester = nextTerm.semester
  promotionDialogVisible.value = true
  await loadPromotionRows()
}

const submitForm = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    const payload = {
      name: form.name,
      class_code: form.class_code || null,
      school_year: normalizeSchoolYear(form.school_year),
      semester: form.semester,
      grade_id: form.grade_id,
      capacity: form.capacity,
      head_teacher_id: form.head_teacher_id,
      assistant_teacher_id: form.assistant_teacher_id,
      english_teacher_id: form.english_teacher_id,
      is_active: form.is_active,
    }

    try {
      if (isEdit.value) {
        await updateClassroom(form.id, payload)
      } else {
        await createClassroom(payload)
      }
      ElMessage.success(isEdit.value ? '班級更新成功' : '班級新增成功')
      closeDialog()
      await fetchClassrooms()
      await classroomStore.refresh()
    } catch (error) {
      ElMessage.error(error.response?.data?.detail || '操作失敗')
    }
  })
}

const handleDelete = async (classroom) => {
  try {
    await ElMessageBox.confirm(
      `確定要停用「${classroom.name}」嗎？`,
      '確認停用',
      {
        confirmButtonText: '停用',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )

    await deleteClassroom(classroom.id)
    ElMessage.success('班級已停用')
    await fetchClassrooms()
    await classroomStore.refresh()
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error.response?.data?.detail || '停用失敗')
  }
}

const openCloneTermDialog = () => {
  cloneTermForm.source_school_year = normalizeSchoolYear(filterSchoolYear.value)
  cloneTermForm.source_semester = filterSemester.value
  const next = nextAcademicTerm(cloneTermForm.source_school_year, cloneTermForm.source_semester)
  cloneTermForm.target_school_year = next.school_year
  cloneTermForm.target_semester = next.semester
  cloneTermForm.copy_teachers = true
  cloneTermDialogVisible.value = true
}

const submitCloneTerm = async () => {
  cloneTermLoading.value = true
  try {
    const response = await cloneClassroomsToTerm({
      source_school_year: normalizeSchoolYear(cloneTermForm.source_school_year),
      source_semester: cloneTermForm.source_semester,
      target_school_year: normalizeSchoolYear(cloneTermForm.target_school_year),
      target_semester: cloneTermForm.target_semester,
      copy_teachers: cloneTermForm.copy_teachers,
    })
    ElMessage.success(`複製完成：共 ${response.data.created_count} 個班級`)
    cloneTermDialogVisible.value = false
    filterSchoolYear.value = normalizeSchoolYear(cloneTermForm.target_school_year)
    filterSemester.value = cloneTermForm.target_semester
    await fetchClassrooms()
    await classroomStore.refresh()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '複製失敗')
  } finally {
    cloneTermLoading.value = false
  }
}

const submitPromotion = async () => {
  const invalidRow = promotionRows.value.find((row) => !isGraduationRow(row) && (!row.target_name || !row.target_grade_id))
  if (invalidRow) {
    ElMessage.warning('請先補齊所有新班名與目標年級')
    return
  }
  try {
    const response = await promoteAcademicYear({
      source_school_year: normalizeSchoolYear(promotionForm.source_school_year),
      source_semester: promotionForm.source_semester,
      target_school_year: normalizeSchoolYear(promotionForm.target_school_year),
      target_semester: promotionForm.target_semester,
      classrooms: promotionRows.value.map((row) => ({
        source_classroom_id: row.source_classroom_id,
        target_name: isGraduationRow(row) ? null : row.target_name,
        target_grade_id: row.target_grade_id,
        copy_teachers: true,
        move_students: true,
      })),
    })
    const createdCount = response.data?.created_count || 0
    const graduatedCount = response.data?.graduated_count || 0
    ElMessage.success(`升班完成：新增 ${createdCount} 班，畢業 ${graduatedCount} 位學生`)
    filterSchoolYear.value = normalizeSchoolYear(promotionForm.target_school_year)
    filterSemester.value = promotionForm.target_semester
    promotionDialogVisible.value = false
    await fetchClassrooms()
    await fetchAvailableSchoolYears()
    await classroomStore.refresh()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '升班失敗')
  }
}

watch(showInactive, () => {
  fetchClassrooms()
})

watch([filterSchoolYear, filterSemester], () => {
  fetchClassrooms()
})

watch(
  () => grades.value,
  () => {
    if (!promotionDialogVisible.value || !promotionRows.value.length) return
    promotionRows.value = promotionRows.value.map((row) => (
      row.target_grade_id
        ? row
        : { ...row, target_grade_id: findNextGradeId(row.source_grade_id) }
    ))
  },
  { deep: true },
)

watch(
  () => [promotionForm.source_school_year, promotionForm.source_semester],
  async () => {
    if (!promotionDialogVisible.value) return
    await loadPromotionRows()
  },
)

onMounted(async () => {
  await fetchOptions()
  await fetchAvailableSchoolYears()
  await fetchClassrooms()
})
</script>

<template>
  <div class="classroom-page">
    <div class="page-header">
      <h2>班級管理</h2>
      <div class="header-actions">
        <el-select v-model="filterSchoolYear" filterable allow-create default-first-option style="width: 150px">
          <el-option
            v-for="year in schoolYearOptions"
            :key="year"
            :label="`${year}學年度`"
            :value="year"
          />
        </el-select>
        <el-select v-model="filterSemester" style="width: 190px">
          <el-option
            v-for="option in semesterOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-switch
          v-model="showInactive"
          inline-prompt
          active-text="顯示停用"
          inactive-text="僅顯示啟用"
        />
        <el-button :icon="RefreshRight" @click="fetchClassrooms">重新整理</el-button>
        <el-button v-if="canWrite" plain @click="openCloneTermDialog">複製學期</el-button>
        <el-button v-if="canWrite" plain @click="openPromotionDialog">升班到新學年</el-button>
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">新增班級</el-button>
      </div>
    </div>

    <div class="classroom-grid" v-if="classrooms.length > 0" v-loading="loading">
      <el-card
        v-for="classroom in classrooms"
        :key="classroom.id"
        class="classroom-card"
        shadow="hover"
        @click="openStudentDrawer(classroom)"
      >
        <template #header>
          <div class="card-header">
            <div class="header-title">
              <span>{{ classroom.name }}</span>
              <el-tag v-if="!classroom.is_active" type="info" size="small">已停用</el-tag>
            </div>
            <div class="card-tags">
              <el-tag size="small" effect="plain" type="primary">
                {{ classroom.semester_label }}
              </el-tag>
              <el-tag size="small" :type="classroom.is_active ? 'success' : 'info'">
                {{ classroom.grade_name || '未設定年級' }}
              </el-tag>
            </div>
          </div>
        </template>

        <div class="card-content">
          <p><strong>班級代號:</strong> {{ classroom.class_code || '-' }}</p>
          <p>
            <strong>學生人數:</strong> {{ classroom.current_count }} / {{ classroom.capacity }}
            <el-tag
              v-if="getCapacityStatus(classroom) === 'full'"
              type="danger"
              size="small"
              style="margin-left: 6px"
            >已滿</el-tag>
            <el-tag
              v-else-if="getCapacityStatus(classroom) === 'warning'"
              type="warning"
              size="small"
              style="margin-left: 6px"
            >接近額滿</el-tag>
          </p>

          <div class="student-preview">
            <div class="section-label">學生摘要</div>
            <template v-if="getStudentPreview(classroom).length > 0">
              <div class="student-preview-tags">
                <el-tag
                  v-for="student in getStudentPreview(classroom)"
                  :key="student.id"
                  size="small"
                  effect="plain"
                  class="student-preview-tag"
                >
                  {{ student.name }}
                </el-tag>
              </div>
              <p v-if="getRemainingStudentCount(classroom) > 0" class="text-muted">
                還有 {{ getRemainingStudentCount(classroom) }} 位學生
              </p>
            </template>
            <p v-else class="text-muted">目前尚無在讀學生</p>
          </div>

          <div class="teacher-info">
            <p v-if="classroom.head_teacher_name">👩‍🏫 {{ classroom.head_teacher_name }}</p>
            <p v-else class="text-muted">未指派班導師</p>
            <p v-if="classroom.assistant_teacher_name">👨‍🏫 {{ classroom.assistant_teacher_name }}</p>
            <p v-if="classroom.english_teacher_name || classroom.art_teacher_name">🌍 {{ classroom.english_teacher_name || classroom.art_teacher_name }}</p>
          </div>

          <div class="card-actions">
            <el-button
              v-if="canReadStudents"
              size="small"
              @click.stop="openStudentDrawer(classroom)"
            >
              查看學生
            </el-button>
            <el-button v-if="canWrite" size="small" :icon="Edit" @click.stop="openEdit(classroom)">編輯</el-button>
            <el-button
              v-if="canWrite && classroom.is_active"
              size="small"
              type="danger"
              plain
              :icon="Delete"
              @click.stop="handleDelete(classroom)"
            >
              停用
            </el-button>
          </div>
        </div>
      </el-card>
    </div>
    <el-empty v-else description="尚無班級資料" />

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px">
      <div v-loading="detailLoading">
        <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="班級名稱" prop="name">
                <el-input v-model="form.name" :disabled="!canWrite" placeholder="例如：向日葵班" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="班級代號">
                <el-input v-model="form.class_code" :disabled="!canWrite" placeholder="例如：SUN-01" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="學年度">
                <el-select v-model="form.school_year" :disabled="!canWrite" filterable allow-create default-first-option style="width: 100%">
                  <el-option
                    v-for="year in schoolYearOptions"
                    :key="year"
                    :label="`${year}學年度`"
                    :value="year"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="學期">
                <el-select v-model="form.semester" :disabled="!canWrite" style="width: 100%">
                  <el-option
                    v-for="option in semesterOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="年級">
                <el-select v-model="form.grade_id" :disabled="!canWrite" placeholder="選擇年級" clearable style="width: 100%">
                  <el-option v-for="grade in grades" :key="grade.id" :label="grade.name" :value="grade.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="班級容量" prop="capacity">
                <el-input-number v-model="form.capacity" :disabled="!canWrite" :min="1" :max="200" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item v-if="isEdit" label="啟用狀態">
            <el-switch v-model="form.is_active" :disabled="!canWrite" inline-prompt active-text="啟用" inactive-text="停用" />
          </el-form-item>

          <h4>教師指派</h4>
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="班導師" label-width="90px">
                <el-select v-model="form.head_teacher_id" :disabled="!canWrite" placeholder="選擇教師" clearable style="width: 100%">
                  <el-option v-for="teacher in teachers" :key="teacher.id" :label="teacher.name" :value="teacher.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="副班導" label-width="90px">
                <el-select v-model="form.assistant_teacher_id" :disabled="!canWrite" placeholder="選擇教師" clearable style="width: 100%">
                  <el-option v-for="teacher in teachers" :key="teacher.id" :label="teacher.name" :value="teacher.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="美語老師" label-width="90px">
                <el-select v-model="form.english_teacher_id" :disabled="!canWrite" placeholder="選擇教師" clearable style="width: 100%">
                  <el-option v-for="teacher in teachers" :key="teacher.id" :label="teacher.name" :value="teacher.id" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>

        <div v-if="isEdit && currentClassroom" class="detail-section">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="班級名稱">{{ currentClassroom.name }}</el-descriptions-item>
            <el-descriptions-item label="學期">{{ currentClassroom.semester_label }}</el-descriptions-item>
            <el-descriptions-item label="年級">{{ currentClassroom.grade_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="學生人數">{{ currentClassroom.current_count }}</el-descriptions-item>
          </el-descriptions>

          <h4 style="margin-top: 20px;">學生名單</h4>
          <div class="student-list">
            <el-tag
              v-for="student in currentClassroom.students"
              :key="student.id"
              class="student-tag"
              :type="student.gender === 'male' ? 'primary' : 'danger'"
              effect="plain"
            >
              {{ student.name }}
            </el-tag>
            <p v-if="!currentClassroom.students || currentClassroom.students.length === 0" class="text-muted">
              尚無學生
            </p>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button v-if="canWrite" type="primary" @click="submitForm">儲存</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="classroomDrawerVisible"
      title="班級學生名單"
      size="520px"
      @close="closeStudentDrawer"
    >
      <div v-loading="classroomDrawerLoading" class="drawer-content">
        <template v-if="drawerClassroom">
          <div class="drawer-header">
            <div>
              <h3>{{ drawerClassroom.name }}</h3>
              <p class="text-muted">{{ drawerClassroom.semester_label }}｜{{ drawerClassroom.grade_name || '未設定年級' }}</p>
            </div>
            <el-tag :type="drawerClassroom.is_active ? 'success' : 'info'">
              {{ drawerClassroom.is_active ? '啟用中' : '已停用' }}
            </el-tag>
          </div>

          <el-descriptions :column="2" border class="drawer-summary">
            <el-descriptions-item label="班級代號">{{ drawerClassroom.class_code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="在讀學生">{{ drawerClassroom.current_count }}</el-descriptions-item>
            <el-descriptions-item label="班導師">{{ drawerClassroom.head_teacher_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="美語老師">{{ drawerClassroom.english_teacher_name || drawerClassroom.art_teacher_name || '-' }}</el-descriptions-item>
          </el-descriptions>

          <div class="drawer-actions">
            <el-button @click="goToStudentManagement(drawerClassroom)">查看全部學生</el-button>
            <el-button v-if="canWriteStudents" type="primary" plain @click="goToStudentManagement(drawerClassroom, 'create')">
              新增學生到本班
            </el-button>
            <el-button v-if="canWriteStudents" type="warning" plain @click="goToStudentManagement(drawerClassroom, 'transfer')">
              批次轉班
            </el-button>
          </div>

          <div class="drawer-students">
            <div class="section-label">完整學生名單</div>
            <el-empty
              v-if="!drawerClassroom.students || drawerClassroom.students.length === 0"
              description="目前沒有學生"
            />
            <div v-else class="student-items">
              <div
                v-for="student in drawerClassroom.students"
                :key="student.id"
                class="student-item"
              >
                <div class="student-main">
                  <span class="student-name">{{ student.name }}</span>
                  <el-tag size="small" :type="student.is_active ? 'success' : 'info'" effect="plain">
                    {{ student.is_active ? '在讀中' : student.status || '未在讀' }}
                  </el-tag>
                </div>
                <div class="student-meta">
                  <span>{{ student.student_id }}</span>
                  <span>{{ student.gender || '-' }}</span>
                  <span>{{ student.parent_phone || '未填家長電話' }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="promotionDialogVisible" title="升班到新學年" width="880px">
      <el-form label-width="100px">
        <el-form-item label="來源學年度">
          <el-select v-model="promotionForm.source_school_year" filterable allow-create default-first-option style="width: 100%">
            <el-option
              v-for="year in schoolYearOptions"
              :key="`source-${year}`"
              :label="`${year}學年度`"
              :value="year"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="來源學期">
          <el-select v-model="promotionForm.source_semester" style="width: 100%">
            <el-option
              v-for="option in semesterOptions"
              :key="`source-${option.value}`"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="目標學年度">
          <el-select v-model="promotionForm.target_school_year" filterable allow-create default-first-option style="width: 100%">
            <el-option
              v-for="year in schoolYearOptions"
              :key="`target-${year}`"
              :label="`${year}學年度`"
              :value="year"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="目標學期">
          <el-select v-model="promotionForm.target_semester" style="width: 100%">
            <el-option
              v-for="option in semesterOptions"
              :key="`target-${option.value}`"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <div class="wizard-summary">
          <el-tag type="success">老師固定沿用</el-tag>
          <el-tag type="warning">在讀學生會一起轉入新班</el-tag>
        </div>
        <el-table :data="promotionRows" v-loading="promotionLoading" border class="promotion-table">
          <el-table-column prop="source_name" label="來源班級" min-width="140" />
          <el-table-column prop="source_grade_name" label="來源年級" width="120" />
          <el-table-column label="新班名" min-width="180">
            <template #default="{ row }">
              <el-input v-if="!isGraduationRow(row)" v-model="row.target_name" placeholder="請輸入新班名" />
              <span v-else class="text-muted">最高年級，直接畢業</span>
            </template>
          </el-table-column>
          <el-table-column label="目標年級" min-width="160">
            <template #default="{ row }">
              <el-select v-if="!isGraduationRow(row)" v-model="row.target_grade_id" placeholder="選擇年級" style="width: 100%">
                <el-option
                  v-for="grade in sortedGrades"
                  :key="grade.id"
                  :label="grade.name"
                  :value="grade.id"
                />
              </el-select>
              <el-tag v-else type="info" effect="plain">畢業</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="老師" width="110">
            <template #default>
              <el-tag type="success" effect="plain">沿用</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="學生" width="110">
            <template #default>
              <el-tag type="warning" effect="plain">搬移</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!promotionLoading && promotionRows.length === 0" description="來源學期沒有可升班的啟用班級" />
      </el-form>
      <template #footer>
        <el-button @click="promotionDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="promotionRows.length === 0" @click="submitPromotion">開始升班</el-button>
      </template>
    </el-dialog>

    <!-- 複製學期 Dialog -->
    <el-dialog v-model="cloneTermDialogVisible" title="複製學期班級" width="460px">
      <el-form label-width="100px">
        <el-form-item label="來源學年度">
          <el-select v-model="cloneTermForm.source_school_year" filterable allow-create default-first-option style="width: 130px">
            <el-option v-for="year in schoolYearOptions" :key="year" :label="`${year}學年度`" :value="year" />
          </el-select>
          <el-select v-model="cloneTermForm.source_semester" style="width: 150px; margin-left: 8px">
            <el-option v-for="opt in semesterOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="目標學年度">
          <el-select v-model="cloneTermForm.target_school_year" filterable allow-create default-first-option style="width: 130px">
            <el-option v-for="year in schoolYearOptions" :key="year" :label="`${year}學年度`" :value="year" />
          </el-select>
          <el-select v-model="cloneTermForm.target_semester" style="width: 150px; margin-left: 8px">
            <el-option v-for="opt in semesterOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="沿用教師">
          <el-switch v-model="cloneTermForm.copy_teachers" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cloneTermDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="cloneTermLoading" @click="submitCloneTerm">確認複製</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.header-actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.classroom-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
}

.classroom-card {
  cursor: pointer;
  transition: transform var(--transition-base);
  height: 100%;
}

.classroom-card:hover {
  transform: translateY(-5px);
}

.classroom-card :deep(.el-card__body) {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.card-tags {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 340px;
  height: 100%;
}

.section-label {
  font-size: 0.85rem;
  color: #606266;
  margin-bottom: 6px;
}

.student-preview {
  min-height: 78px;
}

.student-preview-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.student-preview-tag {
  margin-right: 0;
}

.teacher-info p {
  margin: 0 0 6px;
  font-size: 0.9em;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: auto;
  padding-top: var(--space-2);
}

.detail-section {
  margin-top: var(--space-5);
}

.drawer-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 200px;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
}

.drawer-header h3 {
  margin: 0 0 4px;
}

.drawer-summary {
  margin-top: var(--space-2);
}

.drawer-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.drawer-students {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.student-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.student-item {
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fff;
}

.student-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: 6px;
}

.student-name {
  font-weight: 600;
  color: #303133;
}

.student-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: #606266;
  font-size: 0.9rem;
}

.text-muted {
  color: #909399;
}

.student-list {
  display: flex;
  flex-wrap: wrap;
}

.student-tag {
  margin-right: 5px;
  margin-bottom: 5px;
}

.wizard-summary {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.promotion-table {
  margin-top: var(--space-3);
}

@media (max-width: 767px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  .wizard-summary {
    flex-wrap: wrap;
  }
}
</style>
