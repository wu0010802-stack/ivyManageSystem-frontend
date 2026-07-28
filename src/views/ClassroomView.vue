<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  createClassroom,
  deleteClassroom,
  getClassroom,
  getClassrooms,
  getGrades,
  getTeacherOptions,
  updateClassroom,
} from '@/api/classrooms'
import { getCurrentAcademicTerm, normalizeSchoolYear, buildSchoolYearOptions } from '@/utils/academic'
import { getIntakePlan } from '@/api/recruitmentIntake'
import { mapReservedByGrade, reservedCountFor, type IntakePlanRowLite } from '@/utils/classroomReserved'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock, Delete, Edit, Plus, RefreshRight, User, Reading, MoreFilled } from '@element-plus/icons-vue'
import { capacityStatus, capacityPercent } from '@/utils/classroomCapacity'
import { useClassroomStore } from '@/stores/classroom'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import ClassroomStudentDrawer from '@/components/classroom/ClassroomStudentDrawer.vue'
import ClassroomChangeLogDrawer from '@/components/classroom/ClassroomChangeLogDrawer.vue'
import PlanStatusCard from '@/components/classroom/PlanStatusCard.vue'
import PageHeader from '@/components/common/PageHeader.vue'

interface ClassroomRow { id: number; name: string; class_code?: string | null; school_year: number; semester: number; semester_label?: string; grade_id?: number | null; grade_name?: string; capacity?: number; current_count?: number; is_active?: boolean; head_teacher_id?: number | null; assistant_teacher_id?: number | null; english_teacher_id?: number | null; art_teacher_id?: number | null; head_teacher_name?: string | null; assistant_teacher_name?: string | null; english_teacher_name?: string | null; art_teacher_name?: string | null; student_preview?: Record<string, unknown>[]; students?: Record<string, unknown>[]; [key: string]: unknown }
interface GradeRow { id: number; name: string; sort_order?: number; [key: string]: unknown }
interface TeacherOption { id: number; name: string; [key: string]: unknown }

const classroomStore = useClassroomStore()
const termStore = useAcademicTermStore()
const currentAcademicTerm = getCurrentAcademicTerm()
const classrooms = ref<ClassroomRow[]>([])
const grades = ref<GradeRow[]>([])
const teachers = ref<TeacherOption[]>([])
const loading = ref(false)
const detailLoading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
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
const getCapacityStatus = (classroom: ClassroomRow) => capacityStatus(classroom.current_count, classroom.capacity)
// el-progress 的 status：滿載→紅、接近額滿→黃、正常→綠
const progressStatus = (classroom: ClassroomRow): '' | 'success' | 'warning' | 'exception' => {
  const s = getCapacityStatus(classroom)
  if (s === 'full') return 'exception'
  if (s === 'warning') return 'warning'
  return 'success'
}
// 卡片右上角「⋯」選單：把破壞性的「停用」從主熱區移到次要選單，降低誤觸
const handleCardCommand = (command: string, classroom: ClassroomRow) => {
  if (command === 'edit') void openEdit(classroom)
  else if (command === 'disable') void handleDelete(classroom)
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

// 舊請求後回不得覆寫較新請求的結果（切學期時舊回應覆寫新資料）。
let fetchSeq = 0
const fetchClassrooms = async () => {
  const seq = ++fetchSeq
  loading.value = true
  try {
    const response = await getClassrooms({
      include_inactive: showInactive.value,
      school_year: normalizeSchoolYear(filterSchoolYear.value),
      semester: filterSemester.value,
    })
    if (seq !== fetchSeq) return // 過期回應：已切到別學期，丟棄不覆寫
    classrooms.value = response.data as ClassroomRow[]
  } catch (error) {
    if (seq !== fetchSeq) return
    ElMessage.error(apiError(error, '載入班級資料失敗'))
  } finally {
    if (seq === fetchSeq) {
      loading.value = false
      void loadReservedCounts()
    }
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

let editSeq = 0
const openCreate = async () => {
  editSeq += 1
  detailLoading.value = false
  resetForm()
  isEdit.value = false
  await fetchOptions()
  dialogVisible.value = true
}

// 快速切班時舊 getClassroom 回應不得覆寫較新的 drawer/edit 目標。
let drawerSeq = 0
const openStudentDrawer = async (classroom: ClassroomRow) => {
  if (!canReadStudents.value) {
    if (canWrite.value) await openEdit(classroom)
    return
  }
  classroomDrawerVisible.value = true
  classroomDrawerLoading.value = true
  const seq = ++drawerSeq
  try {
    const response = await getClassroom(classroom.id)
    if (seq !== drawerSeq) return
    drawerClassroom.value = response.data as ClassroomRow
  } catch (error) {
    if (seq !== drawerSeq) return
    ElMessage.error(apiError(error, '載入班級學生資料失敗'))
  } finally {
    if (seq === drawerSeq) classroomDrawerLoading.value = false
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
  const seq = ++editSeq
  try {
    await fetchOptions()
    const response = await getClassroom(classroom.id)
    if (seq !== editSeq) return
    currentClassroom.value = response.data as ClassroomRow
    populateForm(response.data as ClassroomRow)
    isEdit.value = true
    dialogVisible.value = true
  } catch (error) {
    if (seq !== editSeq) return
    ElMessage.error(apiError(error, '載入班級詳情失敗'))
  } finally {
    if (seq === editSeq) detailLoading.value = false
  }
}

const closeDialog = () => {
  dialogVisible.value = false
}

const submitForm = async () => {
  if (submitting.value) return
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return
    if (submitting.value) return

    const fullPayload: Record<string, unknown> = {
      name: form.name,
      class_code: form.class_code || null,
      school_year: normalizeSchoolYear(form.school_year),
      semester: form.semester,
      grade_id: form.grade_id,
      capacity: form.capacity,
      // clearable 的教師下拉清空時 el-select emit undefined；顯式 ?? null，
      // 否則 JSON 丟欄 + 後端 exclude_unset 會讓「清除指派」靜默失敗。
      head_teacher_id: form.head_teacher_id ?? null,
      assistant_teacher_id: form.assistant_teacher_id ?? null,
      english_teacher_id: form.english_teacher_id ?? null,
      is_active: form.is_active,
    }
    const payload = { ...fullPayload }
    if (isEdit.value && currentClassroom.value) {
      const initial: Record<string, unknown> = {
        name: currentClassroom.value.name,
        class_code: currentClassroom.value.class_code ?? null,
        school_year: normalizeSchoolYear(currentClassroom.value.school_year),
        semester: currentClassroom.value.semester,
        grade_id: currentClassroom.value.grade_id ?? null,
        capacity: currentClassroom.value.capacity ?? 30,
        head_teacher_id: currentClassroom.value.head_teacher_id ?? null,
        assistant_teacher_id: currentClassroom.value.assistant_teacher_id ?? null,
        english_teacher_id: currentClassroom.value.english_teacher_id
          ?? currentClassroom.value.art_teacher_id
          ?? null,
        is_active: currentClassroom.value.is_active ?? true,
      }
      for (const key of Object.keys(payload)) {
        if (Object.is(payload[key], initial[key])) delete payload[key]
      }
    }

    submitting.value = true
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
    } finally {
      submitting.value = false
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

const route = useRoute()

onMounted(async () => {
  // fetchOptions 與 fetchClassrooms 彼此無依賴，並行避免序列瀑布（省一個 round-trip）
  await Promise.all([fetchOptions(), fetchClassrooms()])
  // 深連結還原：從學生完整檔案「返回班級」會帶 ?selected=<classroom_id> 回來
  // （StudentDetailPanel.handleBack），重新開啟該班學生抽屜，回到原班上下文。
  // openStudentDrawer 只需 id（內部自行 getClassroom），故不必等 classrooms 清單。
  const selected = Number(route.query?.selected)
  if (Number.isFinite(selected) && selected > 0) {
    void openStudentDrawer({ id: selected } as ClassroomRow)
  }
})

onUnmounted(() => {
  fetchSeq += 1
  drawerSeq += 1
  editSeq += 1
})

interface ClassroomDrawerProp { id?: number; name?: string; grade_name?: string; semester_label?: string; is_active?: boolean; capacity?: number; students?: { id: number; name?: string; gender?: string; [key: string]: unknown }[] }
const castDrawerClassroom = computed((): ClassroomDrawerProp | null => drawerClassroom.value as unknown as ClassroomDrawerProp | null)
</script>

<template>
  <div class="classroom-page">
    <PageHeader title="班級學生管理">
      <template #actions>
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
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">新增班級</el-button>
      </template>
    </PageHeader>

    <PlanStatusCard />

    <!-- 載入骨架：初次載入或切到尚無資料的學期時，避免先閃「尚無班級資料」再跳出卡片 -->
    <div v-if="loading && classrooms.length === 0" class="classroom-grid classroom-skeleton" aria-hidden="true">
      <el-card v-for="n in 6" :key="`sk-${n}`" class="classroom-card is-skeleton" shadow="never">
        <el-skeleton :rows="5" animated />
      </el-card>
    </div>

    <div class="classroom-grid" v-else-if="classrooms.length > 0" v-loading="loading">
      <el-card
        v-for="classroom in classrooms"
        :key="classroom.id"
        class="classroom-card"
        shadow="hover"
        role="button"
        tabindex="0"
        :aria-label="`開啟 ${classroom.name} 學生管理`"
        @click="openStudentDrawer(classroom)"
        @keydown.enter.prevent="openStudentDrawer(classroom)"
        @keydown.space.prevent="openStudentDrawer(classroom)"
      >
        <template #header>
          <div class="card-header">
            <div class="header-title">
              <span class="class-name">{{ classroom.name }}</span>
              <el-tag v-if="!classroom.is_active" type="info" size="small">已停用</el-tag>
            </div>
            <div class="card-tags">
              <el-tag size="small" effect="plain" type="primary">
                {{ classroom.semester_label }}
              </el-tag>
              <el-tag size="small" effect="plain" type="info">
                {{ classroom.grade_name || '未設定年級' }}
              </el-tag>
            </div>
          </div>
        </template>

        <div class="card-content">
          <dl class="card-meta">
            <div class="meta-row">
              <dt>班級代號</dt>
              <dd>{{ classroom.class_code || '—' }}</dd>
            </div>
            <div class="meta-row">
              <dt>學生人數</dt>
              <dd class="count-cell">
                <span class="count-text">{{ classroom.current_count ?? 0 }} / {{ classroom.capacity ?? '—' }}</span>
                <el-tag
                  v-if="reservedCountFor(reservedByGrade, classroom) > 0"
                  type="warning"
                  effect="plain"
                  size="small"
                  :title="`同年級暫定編班（未註冊）${reservedCountFor(reservedByGrade, classroom)} 人`"
                >保留 {{ reservedCountFor(reservedByGrade, classroom) }}</el-tag>
                <el-tag v-if="getCapacityStatus(classroom) === 'full'" type="danger" size="small">已滿</el-tag>
                <el-tag v-else-if="getCapacityStatus(classroom) === 'warning'" type="warning" size="small">接近額滿</el-tag>
              </dd>
            </div>
          </dl>

          <el-progress
            class="capacity-progress"
            :percentage="capacityPercent(classroom.current_count, classroom.capacity)"
            :status="progressStatus(classroom)"
            :stroke-width="8"
            :show-text="false"
            aria-hidden="true"
          />

          <div class="teacher-info">
            <p :class="{ 'text-muted': !classroom.head_teacher_name }">
              <el-icon><User /></el-icon>
              <span class="role-label">班導</span>{{ classroom.head_teacher_name || '未指派' }}
            </p>
            <p v-if="classroom.assistant_teacher_name">
              <el-icon><User /></el-icon>
              <span class="role-label">副班</span>{{ classroom.assistant_teacher_name }}
            </p>
            <p v-if="classroom.english_teacher_name || classroom.art_teacher_name">
              <el-icon><Reading /></el-icon>
              <span class="role-label">美語</span>{{ classroom.english_teacher_name || classroom.art_teacher_name }}
            </p>
          </div>

          <div class="card-actions" @click.stop>
            <el-button
              v-if="canReadStudents"
              size="small"
              :icon="Clock"
              @click="openChangeLogDrawer(classroom)"
            >
              歷史紀錄
            </el-button>
            <el-dropdown
              v-if="canWrite"
              trigger="click"
              @command="(cmd: string) => handleCardCommand(cmd, classroom)"
            >
              <el-button size="small" :icon="MoreFilled" aria-label="更多操作" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit" :icon="Edit">編輯班級</el-dropdown-item>
                  <el-dropdown-item
                    v-if="classroom.is_active"
                    command="disable"
                    :icon="Delete"
                    divided
                    class="dropdown-danger"
                  >停用班級</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </el-card>
    </div>

    <el-empty v-else description="尚無班級資料">
      <el-button v-if="canWrite" type="primary" :icon="Plus" class="empty-create-btn" @click="openCreate">
        新增班級
      </el-button>
    </el-empty>

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
        <el-button v-if="canWrite" type="primary" :loading="submitting" @click="submitForm">儲存</el-button>
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
  </div>
</template>

<style scoped>
.classroom-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
}

.classroom-card {
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
  height: 100%;
}

.classroom-card:hover {
  transform: translateY(-4px);
}

.classroom-card:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.classroom-card.is-skeleton {
  cursor: default;
}

.classroom-card.is-skeleton:hover {
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .classroom-card,
  .classroom-card:hover {
    transition: none;
    transform: none;
  }
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
  height: 100%;
}

.class-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 結構化 metadata：label 在左、值在右，取代原本的「粗體冒號」inline 排版 */
.card-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.meta-row dt {
  font-size: 0.8rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.meta-row dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}

.count-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.count-text {
  font-variant-numeric: tabular-nums;
}

.capacity-progress {
  margin-top: calc(-1 * var(--space-1, 4px));
}

.teacher-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.teacher-info p {
  margin: 0;
  font-size: 0.9em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.teacher-info .el-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.role-label {
  display: inline-block;
  min-width: 2.4em;
  color: var(--text-secondary);
  font-size: 0.82em;
}

.dropdown-danger {
  color: var(--el-color-danger);
}

.empty-create-btn {
  margin-top: var(--space-3);
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

@media (--to-sm) {
  /* 觸控目標：卡片動作按鈕在手機上加大到 ≥44px，降低誤觸 */
  .card-actions :deep(.el-button) {
    min-height: 44px;
    min-width: 44px;
  }
}
</style>
