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
import { ArrowRight, Clock, Delete, Edit, Grid, Plus, MoreFilled } from '@element-plus/icons-vue'
import { capacityStatus, capacityPercent } from '@/utils/classroomCapacity'
import { formatTeacherOptionLabel } from '@/utils/teacherOption'
import { useClassroomStore } from '@/stores/classroom'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { useClientTableFilter } from '@/composables'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import ClassroomStudentDrawer from '@/components/classroom/ClassroomStudentDrawer.vue'
import ClassroomChangeLogDrawer from '@/components/classroom/ClassroomChangeLogDrawer.vue'
import PlanStatusCard from '@/components/classroom/PlanStatusCard.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import EnrollmentRosterDialog from '@/components/enrollment/EnrollmentRosterDialog.vue'

interface ClassroomRow { id: number; name: string; class_code?: string | null; school_year: number; semester: number; semester_label?: string; grade_id?: number | null; grade_name?: string; capacity?: number; current_count?: number; is_active?: boolean; head_teacher_id?: number | null; assistant_teacher_id?: number | null; english_teacher_id?: number | null; art_teacher_id?: number | null; head_teacher_name?: string | null; assistant_teacher_name?: string | null; english_teacher_name?: string | null; art_teacher_name?: string | null; student_preview?: Record<string, unknown>[]; students?: Record<string, unknown>[]; [key: string]: unknown }
interface GradeRow { id: number; name: string; sort_order?: number; [key: string]: unknown }
interface TeacherOption { id: number; name: string; employee_id?: string | null; position?: string | null; [key: string]: unknown }

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
// 編輯 dialog 的學生名單母集合：在讀生（is_active !== false），對齊後端
// current_count 口徑；混列已離園/已刪除學生會與人數對不上（2026-08-01 稽核）
const activeDialogStudents = computed(() => (
  (currentClassroom.value?.students ?? []).filter((s) => s.is_active !== false)
))
const classroomDrawerVisible = ref(false)
const classroomDrawerLoading = ref(false)
const drawerClassroom = ref<ClassroomRow | null>(null)
const changeLogDrawerVisible = ref(false)
const changeLogClassroom = ref<ClassroomRow | null>(null)
const statsDialogVisible = ref(false)
const canWrite = computed(() => hasPermission('CLASSROOMS_WRITE'))
const canReadStudents = computed(() => hasPermission('STUDENTS_READ'))
const reservedByGrade = ref<Record<number, number>>({})

// 客端關鍵字過濾：班級清單已全載，班級名稱/班導姓名即打即濾。
// 用 ClassroomRow（而非 recipe 常見的 Record<string, unknown>）避免 filteredClassrooms
// 流入模板後對 openStudentDrawer 等既有函式簽章造成型別破口（該幾支函式吃 ClassroomRow）。
const {
  searchQuery: classroomSearch,
  filtered: filteredClassrooms,
  total: classroomTotal,
} = useClientTableFilter<ClassroomRow>({
  source: () => classrooms.value,
  searchFields: (r) => [r.name, r.head_teacher_name],
})

// ── 結構化篩選（2026-08-24 改版）───────────────────────────────────────────
// 統計列（接近額滿/已滿/未指派班導）與年級為客端篩選，疊在關鍵字搜尋之上取交集；
// filteredClassrooms 維持「僅關鍵字」語意不變（既有測試與 total 口徑沿用）。
type StatFilterKey = 'near' | 'full' | 'nohead'
const statFilter = ref<StatFilterKey | null>(null)
const gradeFilter = ref<string | null>(null)

const activeClassrooms = computed(() => classrooms.value.filter((c) => c.is_active !== false))

const rosterStats = computed(() => {
  let enrolled = 0
  let capacity = 0
  let near = 0
  let full = 0
  let noHead = 0
  for (const c of activeClassrooms.value) {
    enrolled += c.current_count ?? 0
    capacity += c.capacity ?? 0
    const s = capacityStatus(c.current_count, c.capacity)
    if (s === 'full') full += 1
    else if (s === 'warning') near += 1
    if (!c.head_teacher_name) noHead += 1
  }
  return { classCount: activeClassrooms.value.length, enrolled, capacity, near, full, noHead }
})

const toggleStatFilter = (key: StatFilterKey) => {
  statFilter.value = statFilter.value === key ? null : key
}

const matchesStatFilter = (c: ClassroomRow): boolean => {
  if (!statFilter.value) return true
  // 統計列只統計啟用中的班級，篩選口徑一致：停用班不落入任何統計桶
  if (c.is_active === false) return false
  const s = capacityStatus(c.current_count, c.capacity)
  if (statFilter.value === 'near') return s === 'warning'
  if (statFilter.value === 'full') return s === 'full'
  return !c.head_teacher_name
}

const visibleClassrooms = computed(() => filteredClassrooms.value.filter((c) => (
  (!gradeFilter.value || c.grade_name === gradeFilter.value) && matchesStatFilter(c)
)))

// 年級選項：取當前清單實際出現的年級（避免死選項），依 grades.sort_order 排序
const gradeFilterGroup = computed(() => {
  const names = Array.from(new Set(
    classrooms.value.map((c) => c.grade_name).filter((n): n is string => Boolean(n)),
  ))
  if (names.length === 0) return []
  const order = new Map(grades.value.map((g) => [g.name, g.sort_order ?? 0]))
  names.sort((a, b) => ((order.get(a) ?? 99) - (order.get(b) ?? 99)) || a.localeCompare(b, 'zh-Hant'))
  return [{
    key: 'grade',
    label: '年級',
    options: names.map((n) => ({ label: n, value: n })),
  }]
})
const listFilterValues = computed<Record<string, unknown>>(() => (
  gradeFilter.value ? { grade: gradeFilter.value } : {}
))
const onFilterValuesUpdate = (v: Record<string, unknown>) => {
  gradeFilter.value = typeof v.grade === 'string' && v.grade ? v.grade : null
}
const clearListFilters = () => {
  classroomSearch.value = ''
  gradeFilter.value = null
  statFilter.value = null
}

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

// 容量狀態文案：與 capacityStatus 同口徑，容量缺失時不顯示（count-text 已是「N / —」）
const capacityCaption = (classroom: ClassroomRow): string => {
  const cap = Number(classroom.capacity)
  if (!Number.isFinite(cap) || cap <= 0) return ''
  const count = Math.max(0, classroom.current_count ?? 0)
  const s = getCapacityStatus(classroom)
  if (s === 'full') return '已滿'
  const remaining = Math.max(0, cap - count)
  if (s === 'warning') return `接近額滿・尚餘 ${remaining} 名`
  return `尚餘 ${remaining} 名`
}

// 年級 chip 上色：幼幼藍/小黃/中綠/大紫，方便整片卡片網格掃視；
// 名稱比對先查「幼幼」再查「小」，避免「幼幼班」誤落小班桶
const gradeChipClass = (name?: string): string => {
  if (!name) return 'grade-chip--default'
  if (name.includes('幼幼')) return 'grade-chip--nursery'
  if (name.includes('小')) return 'grade-chip--junior'
  if (name.includes('中')) return 'grade-chip--middle'
  if (name.includes('大')) return 'grade-chip--senior'
  return 'grade-chip--default'
}

// 學生預覽頭像：student_preview（後端固定回前 3 名）以姓名末字呈現，
// 色票依序輪替（同一卡片內三色錯開即可，無個資語意）
const AVATAR_CLASSES = ['avatar--sky', 'avatar--green', 'avatar--amber', 'avatar--violet', 'avatar--rose']
const previewStudents = (classroom: ClassroomRow) => (
  (classroom.student_preview ?? []).slice(0, 3).map((s, i) => ({
    key: (s.id as number | string | undefined) ?? `p-${i}`,
    initial: typeof s.name === 'string' && s.name.length > 0 ? s.name.charAt(s.name.length - 1) : '—',
    cls: AVATAR_CLASSES[i % AVATAR_CLASSES.length],
  }))
)
const studentCountText = (classroom: ClassroomRow): string => (
  (classroom.current_count ?? 0) > 0 ? `${classroom.current_count} 名學生` : '尚無學生'
)

// 卡片右上角「⋯」選單：編輯/歷史紀錄/停用集中一處，卡片主熱區只留「點卡開名單」
const handleCardCommand = (command: string, classroom: ClassroomRow) => {
  if (command === 'edit') void openEdit(classroom)
  else if (command === 'history') openChangeLogDrawer(classroom)
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
  // 換學期＝換資料集：結構化篩選（年級/統計）歸零避免殘留到不適用的名單；
  // 關鍵字搜尋是使用者顯式輸入，保留（與員工頁行為一致）
  gradeFilter.value = null
  statFilter.value = null
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
    <PageHeader :title="PAGE_TERMS.classrooms" subtitle="各班在籍概況、師資指派與容量狀態">
      <template #actions>
        <el-select v-model="selectedTermKey" style="width: 220px">
          <el-option
            v-for="t in termOptions"
            :key="t.key"
            :label="t.label"
            :value="t.key"
          />
        </el-select>
        <el-button :icon="Grid" @click="statsDialogVisible = true">統計表</el-button>
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">新增班級</el-button>
      </template>
    </PageHeader>

    <div class="roster-stats" role="group" aria-label="班級統計與快速篩選">
      <div class="stat-tile" data-test="stat-tile-classes">
        <span class="stat-tile__label">班級數</span>
        <span class="stat-tile__value">{{ rosterStats.classCount }}</span>
      </div>
      <div class="stat-tile" data-test="stat-tile-enrolled">
        <span class="stat-tile__label">在籍幼生／容量</span>
        <span class="stat-tile__value">{{ rosterStats.enrolled }} / {{ rosterStats.capacity }}</span>
      </div>
      <button
        type="button"
        class="stat-tile stat-tile--toggle"
        data-test="stat-tile-near"
        :aria-pressed="statFilter === 'near' ? 'true' : 'false'"
        @click="toggleStatFilter('near')"
      >
        <span class="stat-tile__label">接近額滿</span>
        <span class="stat-tile__value stat-tile__value--warning">{{ rosterStats.near }}</span>
      </button>
      <button
        type="button"
        class="stat-tile stat-tile--toggle"
        data-test="stat-tile-full"
        :aria-pressed="statFilter === 'full' ? 'true' : 'false'"
        @click="toggleStatFilter('full')"
      >
        <span class="stat-tile__label">已滿</span>
        <span class="stat-tile__value stat-tile__value--danger">{{ rosterStats.full }}</span>
      </button>
      <button
        type="button"
        class="stat-tile stat-tile--toggle"
        data-test="stat-tile-nohead"
        :aria-pressed="statFilter === 'nohead' ? 'true' : 'false'"
        @click="toggleStatFilter('nohead')"
      >
        <span class="stat-tile__label">未指派班導</span>
        <span class="stat-tile__value stat-tile__value--info">{{ rosterStats.noHead }}</span>
      </button>
    </div>

    <PlanStatusCard />

    <!-- 載入骨架：初次載入或切到尚無資料的學期時，避免先閃「尚無班級資料」再跳出卡片 -->
    <div v-if="loading && classrooms.length === 0" class="classroom-grid classroom-skeleton" aria-hidden="true">
      <el-card v-for="n in 6" :key="`sk-${n}`" class="classroom-card is-skeleton" shadow="never">
        <el-skeleton :rows="5" animated />
      </el-card>
    </div>

    <template v-else>
    <AdminListToolbar
      v-model:search="classroomSearch"
      search-placeholder="搜尋班級名稱或帶班老師"
      :filters="gradeFilterGroup"
      :filter-values="listFilterValues"
      :total="classroomTotal"
      :shown="visibleClassrooms.length"
      @update:filter-values="onFilterValuesUpdate"
    >
      <template #actions>
        <label class="show-inactive-toggle">
          <span>顯示停用班級</span>
          <el-switch v-model="showInactive" />
        </label>
      </template>
    </AdminListToolbar>

    <div class="classroom-grid" v-if="visibleClassrooms.length > 0" v-loading="loading">
      <el-card
        v-for="classroom in visibleClassrooms"
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
              <span class="grade-chip" :class="gradeChipClass(classroom.grade_name)">
                {{ classroom.grade_name || '未設定年級' }}
              </span>
              <el-tag v-if="!classroom.is_active" type="info" size="small">已停用</el-tag>
            </div>
            <div class="card-actions" @click.stop>
              <el-dropdown
                v-if="canWrite || canReadStudents"
                trigger="click"
                @command="(cmd: string) => handleCardCommand(cmd, classroom)"
              >
                <el-button size="small" text :icon="MoreFilled" aria-label="更多操作" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="canWrite" command="edit" :icon="Edit">編輯班級</el-dropdown-item>
                    <el-dropdown-item v-if="canReadStudents" command="history" :icon="Clock">歷史紀錄</el-dropdown-item>
                    <el-dropdown-item
                      v-if="canWrite && classroom.is_active"
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
          <p class="class-code">班級代號 {{ classroom.class_code || '—' }}</p>
        </template>

        <div class="card-content">
          <div class="capacity-block">
            <div class="capacity-line">
              <span class="count-text">{{ classroom.current_count ?? 0 }} / {{ classroom.capacity ?? '—' }} 人</span>
              <span class="capacity-side">
                <el-tag
                  v-if="reservedCountFor(reservedByGrade, classroom) > 0"
                  type="warning"
                  effect="plain"
                  size="small"
                  :title="`同年級暫定編班（未註冊）${reservedCountFor(reservedByGrade, classroom)} 人`"
                >保留 {{ reservedCountFor(reservedByGrade, classroom) }}</el-tag>
                <span class="capacity-caption" :class="`capacity-caption--${getCapacityStatus(classroom)}`">
                  {{ capacityCaption(classroom) }}
                </span>
              </span>
            </div>
            <el-progress
              class="capacity-progress"
              :percentage="capacityPercent(classroom.current_count, classroom.capacity)"
              :status="progressStatus(classroom)"
              :stroke-width="6"
              :show-text="false"
              aria-hidden="true"
            />
          </div>

          <div class="teacher-info">
            <span v-if="!classroom.head_teacher_name" class="teacher-chip teacher-chip--missing">未指派班導</span>
            <span v-else class="teacher-chip">班導・{{ classroom.head_teacher_name }}</span>
            <span v-if="classroom.assistant_teacher_name" class="teacher-chip">副班・{{ classroom.assistant_teacher_name }}</span>
            <span v-if="classroom.english_teacher_name || classroom.art_teacher_name" class="teacher-chip">
              美語・{{ classroom.english_teacher_name || classroom.art_teacher_name }}
            </span>
          </div>

          <div class="card-footer">
            <div class="student-preview">
              <span
                v-for="s in previewStudents(classroom)"
                :key="s.key"
                class="student-avatar"
                :class="s.cls"
                aria-hidden="true"
              >{{ s.initial }}</span>
              <span class="student-count">{{ studentCountText(classroom) }}</span>
            </div>
            <span v-if="canReadStudents" class="card-go" aria-hidden="true">
              查看名單
              <el-icon><ArrowRight /></el-icon>
            </span>
          </div>
        </div>
      </el-card>
    </div>

    <EmptyState
      v-else-if="classrooms.length > 0"
      title="沒有符合條件的班級"
      description="調整搜尋、年級或統計列篩選後再試"
    >
      <template #action>
        <el-button data-test="clear-filters" @click="clearListFilters">清除篩選條件</el-button>
      </template>
    </EmptyState>

    <EmptyState v-else title="尚無班級資料">
      <template #action>
        <el-button v-if="canWrite" type="primary" :icon="Plus" class="empty-create-btn" @click="openCreate">
          新增班級
        </el-button>
      </template>
    </EmptyState>
    </template>

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
                  <el-option v-for="teacher in teachers" :key="teacher.id" :label="formatTeacherOptionLabel(teacher)" :value="teacher.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="副班導" label-width="90px">
                <el-select v-model="form.assistant_teacher_id" :disabled="!canWrite" placeholder="選擇教師" clearable style="width: 100%">
                  <el-option v-for="teacher in teachers" :key="teacher.id" :label="formatTeacherOptionLabel(teacher)" :value="teacher.id" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="美語老師" label-width="90px">
                <el-select v-model="form.english_teacher_id" :disabled="!canWrite" placeholder="選擇教師" clearable style="width: 100%">
                  <el-option v-for="teacher in teachers" :key="teacher.id" :label="formatTeacherOptionLabel(teacher)" :value="teacher.id" />
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
          <!-- 只列在讀生（is_active !== false，NULL 視為在讀對齊後端口徑），
               與上方「學生人數」同一母集合；已離園/已刪除學生看 ClassroomStudentDrawer -->
          <div class="student-list">
            <el-tag
              v-for="student in activeDialogStudents"
              :key="student.id as string | number"
              class="student-tag"
              :type="student.gender === '男' ? 'primary' : 'danger'"
              effect="plain"
            >
              {{ student.name }}
            </el-tag>
            <p v-if="activeDialogStudents.length === 0" class="text-muted">
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

    <EnrollmentRosterDialog v-model:visible="statsDialogVisible" />
  </div>
</template>

<style scoped>
/* ── 統計列（可點擊快速篩選）───────────────────────────────────────────── */
.roster-stats {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}

.stat-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 16px;
  min-width: 112px;
  border-radius: var(--radius-md);
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  text-align: left;
}

button.stat-tile {
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color var(--transition-base), background var(--transition-base);
}

button.stat-tile:hover {
  border-color: var(--el-color-primary-light-5);
}

button.stat-tile:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

button.stat-tile[aria-pressed='true'] {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.stat-tile__label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.stat-tile__value {
  font-size: var(--text-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  color: var(--text-primary);
}

.stat-tile__value--warning { color: var(--color-warning-darker); }
.stat-tile__value--danger { color: var(--color-danger-darker); }
.stat-tile__value--info { color: var(--color-info-darker); }

/* ── 工具列 ──────────────────────────────────────────────────────────── */
.show-inactive-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

/* ── 卡片網格 ─────────────────────────────────────────────────────────── */
.classroom-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-4);
}

.classroom-card {
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
  height: 100%;
}

.classroom-card:hover {
  transform: translateY(-2px);
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
  align-items: flex-start;
  gap: var(--space-2);
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  flex-wrap: wrap;
}

.class-name {
  font-size: var(--text-lg);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.class-code {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* 年級 chip：幼幼藍/小黃/中綠/大紫（含 dark mode 對應） */
.grade-chip {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}
.grade-chip--nursery { background: #e0f2fe; color: #0369a1; }
.grade-chip--junior { background: #fef3c7; color: #b45309; }
.grade-chip--middle { background: #dcfce7; color: #15803d; }
.grade-chip--senior { background: #ede9fe; color: #6d28d9; }
.grade-chip--default { background: var(--bg-color-soft); color: var(--text-secondary); }
html.dark .grade-chip--nursery { background: rgba(2, 132, 199, 0.28); color: #7dd3fc; }
html.dark .grade-chip--junior { background: rgba(180, 83, 9, 0.28); color: #fcd34d; }
html.dark .grade-chip--middle { background: rgba(21, 128, 61, 0.3); color: #86efac; }
html.dark .grade-chip--senior { background: rgba(109, 40, 217, 0.3); color: #c4b5fd; }

.card-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
}

/* ── 容量主視覺 ───────────────────────────────────────────────────────── */
.capacity-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.count-text {
  font-size: var(--text-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.capacity-side {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.capacity-caption {
  font-size: var(--text-xs);
  font-weight: 600;
}
.capacity-caption--normal { color: var(--color-success-darker); }
.capacity-caption--warning { color: var(--color-warning-darker); }
.capacity-caption--full { color: var(--color-danger-darker); }

.capacity-progress {
  margin-top: var(--space-2);
}

/* ── 教師 chips ───────────────────────────────────────────────────────── */
.teacher-info {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.teacher-chip {
  font-size: var(--text-xs);
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background: var(--bg-color-soft);
  color: var(--text-secondary);
}

.teacher-chip--missing {
  background: var(--el-color-warning-light-9);
  border: 1px dashed var(--el-color-warning-light-3);
  color: var(--color-warning-darker);
}

/* ── 卡片 footer：學生預覽 + 導向提示 ─────────────────────────────────── */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: auto;
  padding-top: var(--space-3);
  border-top: 1px solid var(--el-border-color-lighter);
}

.student-preview {
  display: flex;
  align-items: center;
  min-width: 0;
}

.student-avatar {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--el-bg-color);
  margin-right: -6px;
  flex-shrink: 0;
}
.avatar--sky { background: #e0f2fe; color: #0369a1; }
.avatar--green { background: #dcfce7; color: #15803d; }
.avatar--amber { background: #fef3c7; color: #b45309; }
.avatar--violet { background: #ede9fe; color: #6d28d9; }
.avatar--rose { background: #ffe4e6; color: #be123c; }
html.dark .avatar--sky { background: rgba(2, 132, 199, 0.28); color: #7dd3fc; }
html.dark .avatar--green { background: rgba(21, 128, 61, 0.3); color: #86efac; }
html.dark .avatar--amber { background: rgba(180, 83, 9, 0.28); color: #fcd34d; }
html.dark .avatar--violet { background: rgba(109, 40, 217, 0.3); color: #c4b5fd; }
html.dark .avatar--rose { background: rgba(190, 18, 60, 0.3); color: #fda4af; }

.student-count {
  margin-left: var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  white-space: nowrap;
}

.card-go {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--el-color-primary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--transition-base);
  white-space: nowrap;
}

.classroom-card:hover .card-go,
.classroom-card:focus-visible .card-go,
.classroom-card:focus-within .card-go {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .card-go {
    transition: none;
  }
}

.dropdown-danger {
  color: var(--el-color-danger);
}

.empty-create-btn {
  margin-top: var(--space-3);
}

.card-actions {
  flex-shrink: 0;
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
  /* 觸控目標：卡片動作按鈕與統計列在手機上維持 ≥44px，降低誤觸 */
  .card-actions :deep(.el-button) {
    min-height: var(--touch-target-min);
    min-width: var(--touch-target-min);
  }
  .stat-tile {
    min-height: var(--touch-target-min);
  }
  .show-inactive-toggle {
    min-height: var(--touch-target-min);
  }
}
</style>
