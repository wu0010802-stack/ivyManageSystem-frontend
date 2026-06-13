<script setup lang="ts">
import { onMounted, reactive, ref, watch, computed } from 'vue'
import {
  createClassroom,
  deleteClassroom,
  getClassroom,
  getClassrooms,
  getGrades,
  promoteAcademicYear,
  previewPromoteAcademicYear,
  getTeacherOptions,
  updateClassroom,
} from '@/api/classrooms'
import { getCurrentAcademicTerm, normalizeSchoolYear, buildSchoolYearOptions } from '@/utils/academic'
import { isGraduationRow, buildPromotionPayload } from '@/utils/classroomPromotion'
import { getIntakePlan } from '@/api/recruitmentIntake'
import { mapReservedByGrade, reservedCountFor, type IntakePlanRowLite } from '@/utils/classroomReserved'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock, Delete, Edit, Plus, Promotion, RefreshRight } from '@element-plus/icons-vue'
import { useClassroomStore } from '@/stores/classroom'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import ClassroomStudentDrawer from '@/components/classroom/ClassroomStudentDrawer.vue'
import ClassroomChangeLogDrawer from '@/components/classroom/ClassroomChangeLogDrawer.vue'

interface ClassroomRow { id: number; name: string; class_code?: string | null; school_year: number; semester: number; semester_label?: string; grade_id?: number | null; grade_name?: string; capacity?: number; current_count?: number; is_active?: boolean; head_teacher_id?: number | null; assistant_teacher_id?: number | null; english_teacher_id?: number | null; art_teacher_id?: number | null; head_teacher_name?: string | null; assistant_teacher_name?: string | null; english_teacher_name?: string | null; art_teacher_name?: string | null; student_preview?: Record<string, unknown>[]; students?: Record<string, unknown>[]; [key: string]: unknown }
interface GradeRow { id: number; name: string; sort_order?: number; [key: string]: unknown }
interface TeacherOption { id: number; name: string; [key: string]: unknown }
interface PromotionRow { source_classroom_id: number; source_name: string; source_grade_id: number | null; source_grade_name: string; target_name: string; target_grade_id: number | null; copy_teachers: boolean; move_students: boolean; excluded: boolean }
interface PromotePreviewRow { source_classroom_id: number; source_name: string; source_grade_name?: string | null; resolved_target_grade_id?: number | null; resolved_target_grade_name?: string | null; target_name?: string | null; will_graduate: boolean; active_student_count: number; reuses_existing_target: boolean }
interface PromoteConflict { kind: string; source_classroom_id?: number | null; target_name?: string | null; message: string }
interface PromotePreview { source_term: string; target_term: string; rows: PromotePreviewRow[]; will_create_count: number; will_move_student_count: number; will_graduate_count: number; conflicts: PromoteConflict[]; has_blocking_conflict: boolean }

const classroomStore = useClassroomStore()
const termStore = useAcademicTermStore()
const currentAcademicTerm = getCurrentAcademicTerm()
const classrooms = ref<ClassroomRow[]>([])
const grades = ref<GradeRow[]>([])
const teachers = ref<TeacherOption[]>([])
const availableSchoolYears = ref<number[]>([])
const loading = ref(false)
const detailLoading = ref(false)
const dialogVisible = ref(false)
const promotionLoading = ref(false)
const promotionDialogVisible = ref(false)
const previewLoading = ref(false)
const previewResult = ref<PromotePreview | null>(null)
const promotionRows = ref<PromotionRow[]>([])
const formRef = ref<{ validate: (cb: (valid: boolean) => void) => void } | null>(null)
const isEdit = ref(false)
const showInactive = ref(false)
const currentClassroom = ref<ClassroomRow | null>(null)
const classroomDrawerVisible = ref(false)
const classroomDrawerLoading = ref(false)
const drawerClassroom = ref<ClassroomRow | null>(null)
const changeLogDrawerVisible = ref(false)
const changeLogClassroom = ref<ClassroomRow | null>(null)
const canWrite = computed(() => hasPermission('CLASSROOMS_WRITE'))
const canReadStudents = computed(() => hasPermission('STUDENTS_READ'))
const reservedByGrade = ref<Record<number, number>>({})

const filterSchoolYear = computed({
  get: () => termStore.school_year,
  set: (val) => { termStore.school_year = val },
})
const filterSemester = computed({
  get: () => termStore.semester,
  set: (val) => { termStore.semester = val },
})
const semesterOptions = [
  { label: '上學期（8 月 - 1 月）', value: 1 },
  { label: '下學期（2 月 - 7 月）', value: 2 },
]
const schoolYearOptions = computed(() => {
  const years = new Set<number>(buildSchoolYearOptions(currentAcademicTerm.school_year, 1))
  availableSchoolYears.value.forEach((year) => years.add(Number(year)))
  years.add(normalizeSchoolYear(filterSchoolYear.value))
  return Array.from(years).sort((a, b) => b - a)
})

// 僅顯示上一學期、本學期、下一學期的選擇器
const termOptions = computed(() => {
  const { school_year: cy, semester: cs } = currentAcademicTerm
  const semLabel = (s: number) => (s === 1 ? '上學期' : '下學期')
  const prevTerm = cs === 1 ? { school_year: cy - 1, semester: 2 } : { school_year: cy, semester: 1 }
  const nextTerm = cs === 1 ? { school_year: cy, semester: 2 } : { school_year: cy + 1, semester: 1 }
  return [
    { key: `${prevTerm.school_year}-${prevTerm.semester}`, ...prevTerm, label: `${prevTerm.school_year}學年度 ${semLabel(prevTerm.semester)}` },
    { key: `${cy}-${cs}`, school_year: cy, semester: cs, label: `${cy}學年度 ${semLabel(cs)}（本學期）` },
    { key: `${nextTerm.school_year}-${nextTerm.semester}`, ...nextTerm, label: `${nextTerm.school_year}學年度 ${semLabel(nextTerm.semester)}` },
  ]
})
const selectedTermKey = computed({
  get: () => `${filterSchoolYear.value}-${filterSemester.value}`,
  set: (val) => {
    const [y, s] = val.split('-').map(Number)
    filterSchoolYear.value = y
    filterSemester.value = s
  },
})
const nextAcademicTerm = (schoolYear: number, semester: number) => (
  semester === 1
    ? { school_year: schoolYear, semester: 2 }
    : { school_year: schoolYear + 1, semester: 1 }
)
const sortedGrades = computed(() =>
  [...grades.value].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
)
const promotionForm = reactive({
  source_school_year: currentAcademicTerm.school_year,
  source_semester: currentAcademicTerm.semester,
  target_school_year: nextAcademicTerm(currentAcademicTerm.school_year, currentAcademicTerm.semester).school_year,
  target_semester: nextAcademicTerm(currentAcademicTerm.school_year, currentAcademicTerm.semester).semester,
})

const form = reactive<{
  id: number | null; name: string; class_code: string; school_year: number; semester: number
  grade_id: number | null; capacity: number; head_teacher_id: number | null
  assistant_teacher_id: number | null; english_teacher_id: number | null; is_active: boolean
}>({
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
  grade_id: [{ required: true, message: '請選擇年級', trigger: 'change' }],
}

const dialogTitle = computed(() => (isEdit.value ? '編輯班級' : '新增班級'))
const getCapacityStatus = (classroom: ClassroomRow) => {
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

const loadReservedCounts = async () => {
  try {
    const resp = await getIntakePlan({
      school_year: Number(filterSchoolYear.value),
      semester: Number(filterSemester.value) || 1,
    })
    const rows = ((resp.data as { rows?: IntakePlanRowLite[] }).rows ?? [])
    reservedByGrade.value = mapReservedByGrade(rows)
  } catch {
    // 招生資料拿不到不阻塞班級頁：膠囊降級不顯示
    reservedByGrade.value = {}
  }
}

const fetchClassrooms = async () => {
  loading.value = true
  try {
    const response = await getClassrooms({
      include_inactive: showInactive.value,
      school_year: normalizeSchoolYear(filterSchoolYear.value),
      semester: filterSemester.value,
    })
    classrooms.value = response.data as ClassroomRow[]
  } catch (error) {
    ElMessage.error(apiError(error, '載入班級資料失敗'))
  } finally {
    loading.value = false
    void loadReservedCounts()
  }
}

const fetchAvailableSchoolYears = async () => {
  try {
    const response = await getClassrooms({
      include_inactive: true,
      current_only: false,
    })
    availableSchoolYears.value = [...new Set(
      ((response.data || []) as ClassroomRow[])
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
    grades.value = gradesRes.data as GradeRow[]
    teachers.value = teachersRes.data as TeacherOption[]
  } catch (error) {
    ElMessage.error(apiError(error, '載入班級選項失敗'))
  }
}

const populateForm = (data: ClassroomRow) => {
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

const openStudentDrawer = async (classroom: ClassroomRow) => {
  if (!canReadStudents.value) {
    if (canWrite.value) await openEdit(classroom)
    return
  }
  classroomDrawerVisible.value = true
  classroomDrawerLoading.value = true
  try {
    const response = await getClassroom(classroom.id)
    drawerClassroom.value = response.data as ClassroomRow
  } catch (error) {
    ElMessage.error(apiError(error, '載入班級學生資料失敗'))
  } finally {
    classroomDrawerLoading.value = false
  }
}

const openChangeLogDrawer = (classroom: ClassroomRow) => {
  changeLogClassroom.value = classroom
  changeLogDrawerVisible.value = true
}

const handleStudentUpdated = async () => {
  if (drawerClassroom.value) await openStudentDrawer(drawerClassroom.value)
}

const openEdit = async (classroom: ClassroomRow) => {
  detailLoading.value = true
  try {
    await fetchOptions()
    const response = await getClassroom(classroom.id)
    currentClassroom.value = response.data as ClassroomRow
    populateForm(response.data as ClassroomRow)
    isEdit.value = true
    dialogVisible.value = true
  } catch (error) {
    ElMessage.error(apiError(error, '載入班級詳情失敗'))
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

const findNextGradeId = (gradeId: number | null): number | null => {
  if (!shouldAdvanceGrade()) return gradeId
  const currentIndex = sortedGrades.value.findIndex((grade) => grade.id === gradeId)
  if (currentIndex < 0) return null
  return sortedGrades.value[currentIndex - 1]?.id ?? null
}

const loadPromotionRows = async () => {
  promotionLoading.value = true
  previewResult.value = null
  try {
    const response = await getClassrooms({
      school_year: normalizeSchoolYear(promotionForm.source_school_year),
      semester: promotionForm.source_semester,
      include_inactive: false,
    })
    promotionRows.value = ((response.data || []) as ClassroomRow[]).map((classroom) => ({
      source_classroom_id: classroom.id,
      source_name: classroom.name,
      source_grade_id: classroom.grade_id ?? null,
      source_grade_name: classroom.grade_name || '未設定年級',
      target_name: findNextGradeId(classroom.grade_id ?? null) ? classroom.name : '',
      target_grade_id: findNextGradeId(classroom.grade_id ?? null),
      copy_teachers: true,
      move_students: true,
      excluded: false,
    }))
  } catch (error) {
    promotionRows.value = []
    ElMessage.error(apiError(error, '載入升班資料失敗'))
  } finally {
    promotionLoading.value = false
  }
}

// 開啟「跨學年升班」對話框：預設來源=目前檢視學期、目標=下一學期，使用者可在
// 對話框內逐班調整（目標班名/年級、是否沿用老師、是否搬學生、排除某班），
// 並先預覽影響再確認執行（取代過去切到空學期就靜默自動升班的行為）。
const openPromotionDialog = async () => {
  const sy = normalizeSchoolYear(filterSchoolYear.value)
  const sem = filterSemester.value
  promotionForm.source_school_year = sy
  promotionForm.source_semester = sem
  const next = nextAcademicTerm(sy, sem)
  promotionForm.target_school_year = next.school_year
  promotionForm.target_semester = next.semester
  previewResult.value = null
  promotionRows.value = []
  promotionDialogVisible.value = true
  await loadPromotionRows()
}

const runPreview = async () => {
  const payload = buildPromotionPayload(promotionForm, promotionRows.value)
  if (!payload.classrooms.length) {
    ElMessage.warning('請至少保留一個要升班的班級')
    return
  }
  previewLoading.value = true
  try {
    const response = await previewPromoteAcademicYear(payload)
    previewResult.value = response.data as PromotePreview
  } catch (error) {
    previewResult.value = null
    ElMessage.error(apiError(error, '升班預覽失敗'))
  } finally {
    previewLoading.value = false
  }
}

const confirmPromotion = async () => {
  if (!previewResult.value) {
    ElMessage.warning('請先預覽影響再確認升班')
    return
  }
  if (previewResult.value.has_blocking_conflict) {
    ElMessage.error('仍有阻擋性衝突，請先排除後再升班')
    return
  }
  promotionLoading.value = true
  try {
    const response = await promoteAcademicYear(buildPromotionPayload(promotionForm, promotionRows.value))
    const createdCount = response.data?.created_count || 0
    const movedCount = response.data?.moved_student_count || 0
    const graduatedCount = response.data?.graduated_count || 0
    ElMessage.success(
      `升班完成：新增 ${createdCount} 班、搬移 ${movedCount} 位學生`
        + (graduatedCount > 0 ? `、畢業 ${graduatedCount} 位` : ''),
    )
    promotionDialogVisible.value = false
    await fetchClassrooms()
    await fetchAvailableSchoolYears()
    await classroomStore.refresh()
  } catch (error) {
    ElMessage.error(apiError(error, '升班失敗'))
  } finally {
    promotionLoading.value = false
  }
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
        await updateClassroom(form.id!, payload)
      } else {
        await createClassroom(payload as Parameters<typeof createClassroom>[0])
      }
      ElMessage.success(isEdit.value ? '班級更新成功' : '班級新增成功')
      closeDialog()
      await fetchClassrooms()
      await classroomStore.refresh()
    } catch (error) {
      ElMessage.error(apiError(error, '操作失敗'))
    }
  })
}

const handleDelete = async (classroom: ClassroomRow) => {
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
    ElMessage.error(apiError(error, '停用失敗'))
  }
}


watch(showInactive, () => {
  fetchClassrooms()
})

watch([filterSchoolYear, filterSemester], () => {
  fetchClassrooms()
})

// 升班對話框內任何調整（學期、逐班設定）都使既有預覽失效，強制重新預覽，
// 確保「確認升班」送出的 payload 與最後一次預覽結果一致。
watch(
  () => [
    promotionRows.value,
    promotionForm.source_school_year,
    promotionForm.source_semester,
    promotionForm.target_school_year,
    promotionForm.target_semester,
  ],
  () => {
    previewResult.value = null
  },
  { deep: true },
)


onMounted(async () => {
  // fetchOptions 與 fetchClassrooms 彼此無依賴，並行避免序列瀑布（省一個 round-trip）
  await Promise.all([fetchOptions(), fetchClassrooms()])
})

interface ClassroomDrawerProp { id?: number; name?: string; grade_name?: string; semester_label?: string; is_active?: boolean; capacity?: number; students?: { id: number; name?: string; gender?: string; [key: string]: unknown }[] }
const castDrawerClassroom = computed((): ClassroomDrawerProp | null => drawerClassroom.value as unknown as ClassroomDrawerProp | null)
</script>

<template>
  <div class="classroom-page">
    <div class="page-header">
      <h2>班級學生管理</h2>
      <div class="header-actions">
        <el-select v-model="selectedTermKey" style="width: 220px">
          <el-option
            v-for="t in termOptions"
            :key="t.key"
            :label="t.label"
            :value="t.key"
          />
        </el-select>
        <el-switch
          v-model="showInactive"
          inline-prompt
          active-text="顯示停用"
          inactive-text="僅顯示啟用"
        />
        <el-button :icon="RefreshRight" @click="fetchClassrooms">重新整理</el-button>
        <el-button v-if="canWrite" :icon="Promotion" @click="openPromotionDialog">跨學年升班</el-button>
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
              v-if="reservedCountFor(reservedByGrade, classroom) > 0"
              type="warning"
              effect="plain"
              size="small"
              style="margin-left: 6px"
              :title="`同年級暫定編班（未報到）${reservedCountFor(reservedByGrade, classroom)} 人`"
            >保留 {{ reservedCountFor(reservedByGrade, classroom) }}</el-tag>
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
              :icon="Clock"
              @click.stop="openChangeLogDrawer(classroom)"
            >
              歷史紀錄
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
              <el-form-item label="年級" prop="grade_id">
                <el-select v-model="form.grade_id" :disabled="!canWrite" placeholder="選擇年級" style="width: 100%">
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
              :key="student.id as string | number"
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

    <ClassroomStudentDrawer
      v-model:visible="classroomDrawerVisible"
      :classroom="castDrawerClassroom"
      :loading="classroomDrawerLoading"
      @student-updated="handleStudentUpdated"
    />

    <ClassroomChangeLogDrawer
      v-model:visible="changeLogDrawerVisible"
      :classroom="changeLogClassroom"
    />

    <el-dialog
      v-model="promotionDialogVisible"
      title="跨學年升班"
      width="900px"
      :close-on-click-modal="false"
    >
      <div v-loading="promotionLoading">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="升班會建立新學期班級、搬移在讀學生；最高年級（無下一年級）的學生將畢業。請先「預覽影響」確認後再執行。"
          style="margin-bottom: 12px"
        />

        <div class="promotion-terms">
          <span>從</span>
          <el-select v-model="promotionForm.source_school_year" style="width: 116px">
            <el-option v-for="year in schoolYearOptions" :key="`ss-${year}`" :label="`${year}學年`" :value="year" />
          </el-select>
          <el-select v-model="promotionForm.source_semester" style="width: 104px">
            <el-option v-for="opt in semesterOptions" :key="`sm-${opt.value}`" :label="opt.value === 1 ? '上學期' : '下學期'" :value="opt.value" />
          </el-select>
          <span>升至</span>
          <el-select v-model="promotionForm.target_school_year" style="width: 116px">
            <el-option v-for="year in schoolYearOptions" :key="`ts-${year}`" :label="`${year}學年`" :value="year" />
          </el-select>
          <el-select v-model="promotionForm.target_semester" style="width: 104px">
            <el-option v-for="opt in semesterOptions" :key="`tm-${opt.value}`" :label="opt.value === 1 ? '上學期' : '下學期'" :value="opt.value" />
          </el-select>
          <el-button :icon="RefreshRight" @click="loadPromotionRows">載入來源班級</el-button>
        </div>

        <el-table
          :data="promotionRows"
          size="small"
          style="margin-top: 12px"
          empty-text="此來源學期沒有可升班的班級"
        >
          <el-table-column label="來源班級" min-width="130">
            <template #default="{ row }">
              <span :class="{ 'row-excluded': row.excluded }">{{ row.source_name }}</span>
              <div class="text-muted">{{ row.source_grade_name }}</div>
            </template>
          </el-table-column>
          <el-table-column label="目標年級（清空＝畢業）" width="170">
            <template #default="{ row }">
              <el-select v-model="row.target_grade_id" :disabled="row.excluded" placeholder="（畢業）" clearable size="small" style="width: 100%">
                <el-option v-for="grade in sortedGrades" :key="grade.id" :label="grade.name" :value="grade.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="新班名" min-width="130">
            <template #default="{ row }">
              <el-input v-if="!isGraduationRow(row)" v-model="row.target_name" :disabled="row.excluded" size="small" placeholder="新班名" />
              <el-tag v-else type="warning" size="small">畢業（不建班）</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="沿用老師" width="84" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.copy_teachers" :disabled="row.excluded || isGraduationRow(row)" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="搬學生" width="78" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.move_students" :disabled="row.excluded || isGraduationRow(row)" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="排除" width="70" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.excluded" size="small" />
            </template>
          </el-table-column>
        </el-table>

        <div v-if="previewResult" class="promotion-preview">
          <el-divider content-position="left">
            預覽影響（{{ previewResult.source_term }} → {{ previewResult.target_term }}）
          </el-divider>
          <div class="preview-summary">
            <el-tag type="primary">新增 {{ previewResult.will_create_count }} 班</el-tag>
            <el-tag type="success">搬移 {{ previewResult.will_move_student_count }} 位學生</el-tag>
            <el-tag v-if="previewResult.will_graduate_count > 0" type="warning">
              畢業 {{ previewResult.will_graduate_count }} 位
            </el-tag>
          </div>
          <el-table :data="previewResult.rows" size="small" style="margin-top: 8px">
            <el-table-column prop="source_name" label="來源班級" min-width="120" />
            <el-table-column label="處置" min-width="220">
              <template #default="{ row }">
                <el-tag v-if="row.will_graduate" type="warning" size="small">
                  畢業 {{ row.active_student_count }} 位
                </el-tag>
                <span v-else>
                  → {{ row.resolved_target_grade_name || '（未知年級）' }}「{{ row.target_name }}」
                  <el-tag size="small" effect="plain">搬 {{ row.active_student_count }} 位</el-tag>
                  <el-tag v-if="row.reuses_existing_target" size="small" type="info">重用停用班</el-tag>
                </span>
              </template>
            </el-table-column>
          </el-table>
          <el-alert
            v-if="previewResult.has_blocking_conflict"
            type="error"
            :closable="false"
            show-icon
            title="有阻擋性衝突，請先排除後再升班："
            style="margin-top: 8px"
          >
            <ul class="conflict-list">
              <li v-for="(c, idx) in previewResult.conflicts" :key="idx">{{ c.message }}</li>
            </ul>
          </el-alert>
        </div>
      </div>

      <template #footer>
        <el-button @click="promotionDialogVisible = false">取消</el-button>
        <el-button :loading="previewLoading" @click="runPreview">預覽影響</el-button>
        <el-button
          type="primary"
          :loading="promotionLoading"
          :disabled="!previewResult || previewResult.has_blocking_conflict"
          @click="confirmPromotion"
        >
          確認升班
        </el-button>
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
  color: var(--text-secondary);
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

.text-muted {
  color: var(--text-tertiary);
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

.promotion-terms {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.row-excluded {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.promotion-preview {
  margin-top: var(--space-3);
}

.preview-summary {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.conflict-list {
  margin: 4px 0 0;
  padding-left: 18px;
}
</style>
