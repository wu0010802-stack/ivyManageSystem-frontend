<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { LocationQueryRaw } from 'vue-router'
import { getStudent, getStudents } from '@/api/students'
import { getClassrooms } from '@/api/classrooms'
import { createDismissalCall, getDismissalCalls } from '@/api/dismissalCalls'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { Edit, Warning, ArrowDown } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import AdminCreateButton from '@/components/common/AdminCreateButton.vue'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { buildRosterProfileQuery, rememberRosterSearch, takeRosterSearch } from '@/utils/studentRosterNavigation'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useConfirmDelete } from '@/composables'
import { apiError } from '@/utils/error'
import { downloadFile } from '@/utils/download'
import { getCurrentAcademicTerm, normalizeSchoolYear, buildSchoolYearOptions } from '@/utils/academic'
import BonusImpactPreview from '@/components/students/BonusImpactPreview.vue'
import StudentEditDialog from '@/components/student/StudentEditDialog.vue'
import { useStudentStore } from '@/stores/student'
import { domainBus, STUDENT_EVENTS } from '@/utils/domainBus'

const route = useRoute()
const router = useRouter()
interface StudentRow {
  id: number
  classroom_id?: number | null
  term_classroom_id?: number | null
  name?: string
  [key: string]: unknown
}
interface ClassroomRow { id: number; name: string; school_year?: number; semester?: number; semester_label?: string; grade_name?: string; [key: string]: unknown }

const { isMobile } = useIsMobile()
const showMoreColumns = ref(false)
const tableRef = ref<{ clearSelection: () => void } | null>(null)
const students = ref<StudentRow[]>([])
const classrooms = ref<ClassroomRow[]>([])
const totalStudents = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
const loading = ref(true)
const selectedStudents = ref<StudentRow[]>([])
const restoredSearch = takeRosterSearch(router)
const searchQuery = ref(restoredSearch)
const debouncedSearch = ref(restoredSearch)
const activeTab = ref('active')  // 'active' | 'graduated'
const transferDialogVisible = ref(false)
const transferTargetClassroomId = ref<number | null>(null)
const transferSubmitting = ref(false)
const transferSourceClassroomId = computed(() => {
  if (!selectedStudents.value.length) return null
  return selectedStudents.value[0].classroom_id ?? null
})
const showAllClassrooms = ref(false)
const handledRouteActionKey = ref('')

const currentAcademicTerm = getCurrentAcademicTerm()
const filterSchoolYear = ref(currentAcademicTerm.school_year)
const filterSemester = ref(currentAcademicTerm.semester)
const filterClassroomId = ref<number | null>(null)
const semesterOptions = [
  { label: '上學期（8 月 - 1 月）', value: 1 },
  { label: '下學期（2 月 - 7 月）', value: 2 },
]

// 畢業/轉出 dialog（單筆 graduateTarget；批次則 graduateBatchMode + selectedStudents）
const graduateDialogVisible = ref(false)
const graduateSubmitting = ref(false)
const graduateTarget = ref<StudentRow | null>(null)
const graduateBatchMode = ref(false)
const graduateFormRef = ref<{ validate: (cb: (valid: boolean) => void) => void } | null>(null)
const graduateForm = reactive({ graduation_date: '', status: '已畢業', reason: '', notes: '' })
const graduateRules = {
  graduation_date: [{ required: true, message: '請選擇離園日期', trigger: 'change' }],
  status: [{ required: true, message: '請選擇類型', trigger: 'change' }]
}
const GRADUATE_REASON_OPTIONS: Record<string, string[]> = {
  已畢業: ['正常畢業'],
  已轉出: ['家庭因素', '健康因素', '搬遷', '轉往他園', '其他'],
}
watch(() => graduateForm.status, () => { graduateForm.reason = '' })
let _searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (val) => {
  if (_searchTimer) clearTimeout(_searchTimer)
  _searchTimer = setTimeout(() => { debouncedSearch.value = val }, 300)
})
onUnmounted(() => {
  if (_searchTimer) clearTimeout(_searchTimer)
})

// 學生新增/編輯 dialog（用 StudentEditDialog 統一）
const editDialogVisible = ref(false)
const editMode = ref('create') // 'create' | 'edit'
const editInitial = ref<StudentRow | null>(null)
const pendingClassroomId = ref<number | null>(null) // 從 route action create 帶入的預設班級
let editLoadSeq = 0

const schoolYearOptions = computed(() => {
  const years = new Set(buildSchoolYearOptions(currentAcademicTerm.school_year))
  classrooms.value.forEach((item) => item.school_year && years.add(Number(item.school_year)))
  years.add(normalizeSchoolYear(filterSchoolYear.value))
  return Array.from(years).sort((a, b) => b - a)
})

const classroomLabel = (classroom: ClassroomRow | undefined) => {
  if (!classroom) return '-'
  return `${classroom.name}｜${classroom.semester_label || '-'}｜${classroom.grade_name || '未設定年級'}`
}

const filteredClassroomOptions = computed(() => {
  if (showAllClassrooms.value) return classrooms.value
  return classrooms.value.filter((item) => (
    item.school_year === normalizeSchoolYear(filterSchoolYear.value)
    && item.semester === filterSemester.value
  ))
})

// 指派用選項（編輯/轉班目標）：排除歷史學期班級，對齊後端
// _assert_classroom_not_past_term 守衛——把在讀生掛進舊班會讓學生從當期
// 名單與在籍統計消失；未來學期保留（暑假預先編班合法）。
const assignableClassroomOptions = computed(() => (
  filteredClassroomOptions.value.filter((item) => (
    Number(item.school_year) * 10 + Number(item.semester)
      >= currentAcademicTerm.school_year * 10 + currentAcademicTerm.semester
  ))
))

const dialogClassroomOptions = computed(() => {
  const options = [...assignableClassroomOptions.value]
  const cid = editInitial.value?.classroom_id || pendingClassroomId.value
  if (cid && !options.some((item) => item.id === cid)) {
    const selected = classrooms.value.find((item) => item.id === cid)
    if (selected) options.push(selected)
  }
  return options
})

watch(debouncedSearch, () => {
  if (_applyingRoute) return
  currentPage.value = 1
  clearSelection()
  syncRouteQuery()
  fetchStudents()
})

const exportStudents = () => {
  downloadFile('/exports/students', '學生名冊.xlsx')
}

// 教育局全國幼生管理系統（kids.k12ea.gov.tw）匯入檔：頁面當下篩到誰就匯出誰
const exportK12ea = () => {
  downloadFile('/exports/students/k12ea', '幼生資料匯入.xls', {
    is_active: activeTab.value === 'active',
    school_year: normalizeSchoolYear(filterSchoolYear.value),
    semester: filterSemester.value,
    classroom_id: filterClassroomId.value || undefined,
    search: debouncedSearch.value || undefined,
  })
}

// 接送通知：有 pending/acknowledged 通知的學生 ID 集合
const activeCallStudentIds = ref(new Set())

const fetchActiveCallIds = async () => {
  try {
    const res = await getDismissalCalls({ status: undefined })
    const activeIds = new Set(
      ((res.data || []) as Record<string, unknown>[])
        .filter((c) => c.status === 'pending' || c.status === 'acknowledged')
        .map((c) => c.student_id)
    )
    activeCallStudentIds.value = activeIds
  } catch {
    // silent
  }
}

// request-sequence guard：12 個觸發點（切班級 / 學年 / 學期 / 分頁 / 分頁大小 / 搜尋 /
// tab / route.query / domainBus 刷新等）可能併發搶答，晚到的舊回應不得覆寫最新 students/totalStudents。
let fetchSeq = 0

const fetchStudents = async () => {
  const seq = ++fetchSeq
  loading.value = true
  try {
    const skip = (currentPage.value - 1) * pageSize.value
    const response = await getStudents({
      skip,
      limit: pageSize.value,
      is_active: activeTab.value === 'active',
      school_year: normalizeSchoolYear(filterSchoolYear.value),
      semester: filterSemester.value,
      classroom_id: filterClassroomId.value || undefined,
      search: debouncedSearch.value || undefined,
    })
    if (seq !== fetchSeq) return
    if (selectedStudents.value.some(selected => !response.data.items.some(student => student.id === selected.id))) clearSelection()
    else selectedStudents.value = response.data.items.filter(student => selectedStudents.value.some(selected => selected.id === student.id))
    students.value = response.data.items
    totalStudents.value = response.data.total
    if (activeTab.value === 'active') {
      fetchActiveCallIds()
    }
  } catch (error) {
    if (seq !== fetchSeq) return
    ElMessage.error(friendlyError('載入學生資料失敗', error))
  } finally {
    if (seq === fetchSeq) loading.value = false
  }
}

const handleNotifyDismissal = async (row: StudentRow) => {
  if (!row.classroom_id) {
    ElMessage.warning('此學生尚未分班，無法發送接送通知')
    return
  }
  try {
    await createDismissalCall({
      student_id: row.id,
      classroom_id: row.classroom_id,
    })
    ElMessage.success(`已通知 ${row.name} 的班級老師`)
    fetchActiveCallIds()
  } catch (error) {
    ElMessage.error(apiError(error, '通知失敗'))
  }
}

const handleTabChange = () => {
  currentPage.value = 1
  clearSelection()
  syncRouteQuery()
  fetchStudents()
}

const resetGraduateForm = () => {
  graduateForm.graduation_date = ''
  graduateForm.status = '已畢業'
  graduateForm.reason = ''
  graduateForm.notes = ''
}

const openGraduateDialog = (row: StudentRow) => {
  graduateBatchMode.value = false
  graduateTarget.value = row
  resetGraduateForm()
  graduateDialogVisible.value = true
}

const openBatchGraduateDialog = () => {
  if (!selectedStudents.value.length) return
  graduateBatchMode.value = true
  graduateTarget.value = null
  resetGraduateForm()
  graduateDialogVisible.value = true
}

const submitGraduate = async () => {
  if (graduateSubmitting.value) return
  if (!graduateFormRef.value) return
  await graduateFormRef.value.validate(async (valid) => {
    if (!valid) return
    if (graduateSubmitting.value) return
    graduateSubmitting.value = true
    const studentStore = useStudentStore()
    try {
      if (graduateBatchMode.value) {
        const result = await studentStore.bulkGraduate({
          student_ids: selectedStudents.value.map((s) => s.id),
          graduation_date: graduateForm.graduation_date,
          status: graduateForm.status,
          reason: graduateForm.reason || null,
          notes: graduateForm.notes || null,
        })
        const done = result?.graduated_count ?? 0
        const skipped = result?.skipped?.length ?? 0
        ElMessage.success(`已將 ${done} 名學生設為${graduateForm.status}${skipped ? `，略過 ${skipped} 名` : ''}`)
        selectedStudents.value = []
      } else {
        await studentStore.graduateStudent(graduateTarget.value!.id, graduateForm)
        ElMessage.success(`已將「${graduateTarget.value!.name}」設為${graduateForm.status}`)
      }
      graduateDialogVisible.value = false
      fetchStudents()
    } catch (error) {
      ElMessage.error(apiError(error, '操作失敗'))
    } finally {
      graduateSubmitting.value = false
    }
  })
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  clearSelection()
  syncRouteQuery()
  fetchStudents()
}

const handleSizeChange = (size: number) => {
  pageSize.value = size
  currentPage.value = 1
  clearSelection()
  syncRouteQuery()
  fetchStudents()
}

const displayClassroomId = (row: StudentRow) => row.term_classroom_id ?? row.classroom_id ?? null
const classroomName = (id: number | null | undefined) => (
  id ? classroomLabel(classrooms.value.find((classroom) => classroom.id === id)) : '-'
)
const handleSelectionChange = (rows: StudentRow[]) => {
  selectedStudents.value = rows
}
const clearSelection = () => {
  selectedStudents.value = []
  tableRef.value?.clearSelection?.()
}
const toggleStudent = (row: StudentRow, checked: string | number | boolean) => {
  selectedStudents.value = checked === true
    ? [...selectedStudents.value.filter(student => student.id !== row.id), row]
    : selectedStudents.value.filter(student => student.id !== row.id)
}
watch(isMobile, clearSelection)
const mobileColumns = computed(() => [
  { prop: 'classroom', label: '班級', formatter: (row: Record<string, unknown>) => classroomName(displayClassroomId(row as StudentRow)) },
  { prop: 'parent_name', label: '家長' },
  { prop: 'parent_phone', label: '電話' },
  { prop: activeTab.value === 'active' ? 'status_tag' : 'status', label: '狀態' },
  ...(showMoreColumns.value ? [
    { prop: 'student_id', label: '編號' }, { prop: 'gender', label: '性別' },
    { prop: 'birthday', label: '生日' }, { prop: 'enrollment_date', label: '入學日' },
  ] : []),
  ...(activeTab.value === 'graduated' ? [{ prop: 'graduation_date', label: '離園日' }] : []),
])
const openTransferDialog = () => {
  const sourceIds = new Set(selectedStudents.value.map((student) => student.classroom_id ?? null))
  if (sourceIds.size > 1) {
    ElMessage.warning('批次轉班請選擇同一來源班級的學生')
    return
  }
  transferTargetClassroomId.value = null
  transferDialogVisible.value = true
}
const submitTransfer = async () => {
  if (transferSubmitting.value) return
  if (!selectedStudents.value.length) return
  if (!transferTargetClassroomId.value) {
    ElMessage.warning('請先選擇目標班級')
    return
  }
  transferSubmitting.value = true
  try {
    const studentStore = useStudentStore()
    await studentStore.bulkTransfer({
      student_ids: selectedStudents.value.map((student) => student.id),
      target_classroom_id: transferTargetClassroomId.value,
      source_classroom_id: transferSourceClassroomId.value,
    })
    ElMessage.success('學生轉班成功')
    transferDialogVisible.value = false
    selectedStudents.value = []
    fetchStudents()
  } catch (error) {
    ElMessage.error(apiError(error, '轉班失敗'))
  } finally {
    transferSubmitting.value = false
  }
}

const openProfile = (row: StudentRow) => {
  rememberRosterSearch(router, searchQuery.value)
  router.push({ name: 'student-profile', params: { id: row.id }, query: buildRosterProfileQuery(rosterQuery()) })
}

const handleAdd = () => {
  editLoadSeq += 1
  editInitial.value = null
  pendingClassroomId.value = null
  editMode.value = 'create'
  editDialogVisible.value = true
}

const handleEdit = async (row: StudentRow) => {
  const seq = ++editLoadSeq
  try {
    const response = await getStudent(row.id)
    if (seq !== editLoadSeq) return
    editInitial.value = { ...row, ...(response.data as StudentRow) }
    pendingClassroomId.value = editInitial.value.classroom_id || null
    editMode.value = 'edit'
    editDialogVisible.value = true
  } catch (error) {
    if (seq !== editLoadSeq) return
    ElMessage.error(apiError(error, '載入學生完整資料失敗'))
  }
}

const handleEditSaved = () => {
  editDialogVisible.value = false
  fetchStudents()
}

const { confirmDelete: handleDelete } = useConfirmDelete({
  endpoint: '/students',
  onSuccess: (row: unknown) => {
    domainBus.emit(STUDENT_EVENTS.DELETED, { id: (row as { id?: number })?.id })
    fetchStudents()
  },
  successMsg: '刪除成功',
})

// 列內次要操作收進「更多」dropdown，降低每列動作密度
const handleRowCommand = (command: string, row: StudentRow) => {
  if (command === 'notify') handleNotifyDismissal(row)
  else if (command === 'graduate') openGraduateDialog(row)
  else if (command === 'delete') handleDelete(row)
}

const positiveInteger = (value: unknown, fallback: number | null): number | null => {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}
const rosterQuery = () => ({
  school_year: String(normalizeSchoolYear(filterSchoolYear.value)),
  semester: String(filterSemester.value),
  classroom_id: filterClassroomId.value ? String(filterClassroomId.value) : undefined,
  show_all: showAllClassrooms.value ? '1' : undefined,
  status: activeTab.value,
  page: String(currentPage.value),
  page_size: String(pageSize.value),
})
let lastWrittenQuery = ''
const syncRouteQuery = () => {
  if (_applyingRoute) return
  const query: LocationQueryRaw = { ...route.query, ...rosterQuery() }
  // 搜尋可能含幼生／家長姓名，只保留在此名冊流程的記憶體。
  delete query.q
  lastWrittenQuery = JSON.stringify(query)
  void router.push({ query })
}
const applyRouteContext = () => {
  const parsedSemester = Number(route.query.semester)
  filterSchoolYear.value = normalizeSchoolYear(route.query.school_year)
  filterSemester.value = [1, 2].includes(parsedSemester) ? parsedSemester : currentAcademicTerm.semester
  filterClassroomId.value = positiveInteger(route.query.classroom_id, null)
  showAllClassrooms.value = route.query.show_all === '1'
  activeTab.value = route.query.status === 'graduated' ? 'graduated' : 'active'
  currentPage.value = positiveInteger(route.query.page, 1) ?? 1
  const size = positiveInteger(route.query.page_size, 50)
  pageSize.value = size && [20, 50, 100].includes(size) ? size : 50
  // 在籍記錄表點學生跳轉：以 ?q= 預填搜尋框並觸發查詢
  if (typeof route.query.q === 'string' && route.query.q) {
    searchQuery.value = route.query.q
    debouncedSearch.value = route.query.q
  }
}

const clearRouteAction = async () => {
  if (!route.query.action) return
  const nextQuery = { ...route.query }
  delete nextQuery.action
  if (nextQuery.tab !== 'tasks' && nextQuery.tab !== 'roster') nextQuery.tab = 'roster'
  await router.replace({ query: nextQuery })
}

const handleRouteAction = async () => {
  const actionKey = JSON.stringify(route.query)
  if (handledRouteActionKey.value === actionKey) return

  if (route.query.action === 'create' && route.query.classroom_id) {
    editLoadSeq += 1
    pendingClassroomId.value = Number(route.query.classroom_id)
    editInitial.value = { id: 0, classroom_id: pendingClassroomId.value }
    editMode.value = 'create'
    editDialogVisible.value = true
    handledRouteActionKey.value = actionKey
    await clearRouteAction()
    return
  }

  if (route.query.action === 'transfer' && route.query.classroom_id && activeTab.value === 'active') {
    selectedStudents.value = students.value.filter((student) => student.classroom_id === Number(route.query.classroom_id))
    if (selectedStudents.value.length > 0) {
      transferTargetClassroomId.value = null
      transferDialogVisible.value = true
    } else {
      ElMessage.warning('目前班級沒有可轉班的在讀學生')
    }
    handledRouteActionKey.value = actionKey
    await clearRouteAction()
    return
  }

  handledRouteActionKey.value = actionKey
}

const loadClassrooms = async () => {
  try {
    const res = await getClassrooms({ current_only: false })
    classrooms.value = res.data as ClassroomRow[]
  } catch (e) {
    ElMessage.error(friendlyError('載入班級資料失敗', e))
  }
}

let _applyingRoute = false

watch([filterSchoolYear, filterSemester, filterClassroomId], ([, , cid], [prevYear, prevSem]) => {
  if (_applyingRoute) return
  // 切換學年/學期時清掉不屬於新學期的班級篩選：殘留舊學期班級 id 會讓
  // 列表靜默變 0 筆（後端以班級學期 join 過濾）。清空會再觸發本 watch，
  // 由那一輪執行 fetch，避免重複請求。
  const termChanged = filterSchoolYear.value !== prevYear || filterSemester.value !== prevSem
  if (
    termChanged
    && cid != null
    && !filteredClassroomOptions.value.some((item) => item.id === cid)
  ) {
    filterClassroomId.value = null
    return
  }
  currentPage.value = 1
  clearSelection()
  syncRouteQuery()
  fetchStudents()
})

watch(showAllClassrooms, () => syncRouteQuery())

watch(
  () => route.query,
  async () => {
    if (route.path && route.path !== '/students') return
    // 本頁剛寫入的 query 已完成查詢；URL 的正規化會省略 undefined。
    const writtenQuery = lastWrittenQuery
    lastWrittenQuery = ''
    if (JSON.stringify(route.query) === writtenQuery) return
    const previousFilters = JSON.stringify(rosterQuery())
    _applyingRoute = true
    applyRouteContext()
    if (JSON.stringify(rosterQuery()) !== previousFilters) clearSelection()
    await nextTick()
    _applyingRoute = false
    await fetchStudents()
    await handleRouteAction()
  },
)

const onBusRefresh = () => fetchStudents()
const busEvents = [
  STUDENT_EVENTS.UPDATED,
  STUDENT_EVENTS.CREATED,
  STUDENT_EVENTS.DELETED,
  STUDENT_EVENTS.TRANSFERRED,
  STUDENT_EVENTS.LIFECYCLE_CHANGED,
]
busEvents.forEach((evt) => domainBus.on(evt, onBusRefresh))
onUnmounted(() => {
  fetchSeq += 1
  editLoadSeq += 1
  busEvents.forEach((evt) => domainBus.off(evt, onBusRefresh))
})

onMounted(async () => {
  _applyingRoute = true
  applyRouteContext()
  await nextTick()
  _applyingRoute = false
  // loadClassrooms 與 fetchStudents 無依賴可並行；handleRouteAction 依賴 students 已載入故保留序列
  await Promise.all([loadClassrooms(), fetchStudents()])
  await handleRouteAction()
})
</script>

<template>
  <div class="student-page">
    <PageHeader title="學生名冊" subtitle="依學期與班級查找學生，查看檔案或維護基本資料。">
      <template #actions>
        <AdminCreateButton @click="handleAdd">新增學生</AdminCreateButton>
      </template>
    </PageHeader>

    <div class="filter-section">
      <el-radio-group v-model="activeTab" aria-label="學生在籍狀態" @change="handleTabChange">
        <el-radio-button value="active">在讀中</el-radio-button>
        <el-radio-button value="graduated">已離園</el-radio-button>
      </el-radio-group>
      <div class="filter-toolbar">
        <label class="filter-field"><span>學年度</span>
          <el-select v-model="filterSchoolYear" aria-label="學年度" filterable allow-create default-first-option>
            <el-option v-for="year in schoolYearOptions" :key="year" :label="`${year}學年度`" :value="year" />
          </el-select>
        </label>
        <label class="filter-field"><span>學期</span>
          <el-select v-model="filterSemester" aria-label="學期">
            <el-option v-for="option in semesterOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </label>
        <label class="filter-field filter-field--classroom"><span>班級</span>
          <el-select v-model="filterClassroomId" aria-label="班級" clearable placeholder="全部班級">
            <el-option v-for="classroom in filteredClassroomOptions" :key="classroom.id" :label="classroomLabel(classroom)" :value="classroom.id" />
          </el-select>
        </label>
      </div>
      <div class="classroom-option-setting">
        <el-switch v-model="showAllClassrooms" aria-label="顯示其他學期班級" active-text="顯示其他學期班級" />
        <span class="filter-hint">只擴充班級選項，學生名單仍依所選學年度與學期查詢。</span>
      </div>
    </div>

    <AdminListToolbar v-model:search="searchQuery" search-placeholder="搜尋編號、姓名或家長" :total="totalStudents" :shown="students.length">
      <template #actions>
        <el-checkbox v-model="showMoreColumns">顯示更多欄位</el-checkbox>
        <el-dropdown trigger="click">
          <el-button>匯出名冊<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="exportStudents">匯出 Excel</el-dropdown-item>
              <el-dropdown-item @click="exportK12ea">匯出教育局格式</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </AdminListToolbar>

    <div v-if="activeTab === 'active' && selectedStudents.length" data-test="student-batch-toolbar" class="batch-toolbar" role="region" aria-label="已選學生批次操作">
      <strong role="status">已選 {{ selectedStudents.length }} 位學生</strong>
      <el-button data-test="clear-student-selection" text @click="clearSelection">清除選取</el-button>
      <div class="batch-actions">
        <el-button plain @click="openTransferDialog">批次轉班</el-button>
        <el-button plain @click="openBatchGraduateDialog">批次畢業</el-button>
      </div>
    </div>

    <AdminListCards v-if="isMobile" :items="students" :columns="mobileColumns" row-key="id" :loading="loading" empty-text="沒有符合篩選條件的學生，請調整學期、班級或搜尋文字。">
      <template #title="{ item }">
        <el-checkbox v-if="activeTab === 'active'" :model-value="selectedStudents.some(student => student.id === item.id)" :aria-label="`選取 ${item.name}`" @update:model-value="value => toggleStudent(item as StudentRow, value)">{{ item.name }}</el-checkbox>
        <span v-else>{{ item.name }}</span>
        <el-tag v-if="item.allergy || item.medication || item.special_needs" type="warning" size="small">有健康提醒</el-tag>
      </template>
      <template #actions="{ item }">
        <el-button @click="openProfile(item as StudentRow)">檔案</el-button>
        <el-button :icon="Edit" @click="handleEdit(item as StudentRow)">編輯</el-button>
        <el-dropdown v-if="activeTab === 'active'" trigger="click" @command="(cmd: string) => handleRowCommand(cmd, item as StudentRow)">
          <el-button :aria-label="`${item.name}的更多操作`">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="notify" :disabled="activeCallStudentIds.has(item.id)">{{ activeCallStudentIds.has(item.id) ? '已通知放學' : '通知放學' }}</el-dropdown-item>
              <el-dropdown-item command="graduate">畢業 / 轉出</el-dropdown-item>
              <el-dropdown-item command="delete" divided class="row-action-danger">刪除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </AdminListCards>

    <TableSkeleton v-else-if="loading && !students.length" :columns="8" />
    <el-table
      v-else
      ref="tableRef"
      row-key="id"
      :data="students"
      v-loading="loading"
      stripe
      style="width: 100%"
      max-height="600"
      @selection-change="handleSelectionChange"
    >
      <template #empty><EmptyState title="沒有符合條件的學生" description="請調整學期、班級或搜尋文字。" /></template>
      <el-table-column v-if="activeTab === 'active'" type="selection" reserve-selection width="48" />
      <el-table-column v-if="showMoreColumns" prop="student_id" label="編號" width="100" sortable />
      <el-table-column label="姓名" width="130" sortable prop="name">
        <template #default="{ row }">
          <span>{{ row.name }}</span>
          <el-tooltip
            v-if="row.allergy || row.medication || row.special_needs"
            placement="top"
            :content="[row.allergy && `過敏：${row.allergy}`, row.medication && `用藥：${row.medication}`, row.special_needs && `特殊需求：${row.special_needs}`].filter(Boolean).join(' ／ ')"
          >
            <el-icon style="color: var(--el-color-warning); margin-left: 4px; vertical-align: middle"><Warning /></el-icon>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column v-if="showMoreColumns" label="性別" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.gender === '男'" size="small" type="info" effect="light">男</el-tag>
          <el-tag v-else-if="row.gender === '女'" size="small" type="info" effect="light">女</el-tag>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="班級" min-width="180">
        <template #default="{ row }">
          <span>{{ classroomName(displayClassroomId(row)) }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="showMoreColumns" prop="birthday" label="生日" width="120" />
      <el-table-column prop="parent_name" label="家長" width="120" />
      <el-table-column prop="parent_phone" label="電話" width="150" />
      <el-table-column v-if="showMoreColumns" prop="enrollment_date" label="入學日" width="120" sortable />
      <el-table-column v-if="activeTab === 'graduated'" prop="graduation_date" label="離園日" width="120" sortable />
      <el-table-column v-if="activeTab === 'graduated'" label="離園類型" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === '已畢業' ? 'success' : 'warning'" size="small">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="activeTab === 'active'" prop="status_tag" label="狀態標籤" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.status_tag" size="small">{{ row.status_tag }}</el-tag>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="200">
        <template #default="scope">
          <el-button size="small" @click="openProfile(scope.row)">檔案</el-button>
          <el-button size="small" :icon="Edit" @click="handleEdit(scope.row)">編輯</el-button>
          <el-dropdown
            v-if="activeTab === 'active'"
            trigger="click"
            @command="(cmd: string) => handleRowCommand(cmd, scope.row)"
          >
            <el-button size="small">
              更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  command="notify"
                  :disabled="activeCallStudentIds.has(scope.row.id)"
                >{{ activeCallStudentIds.has(scope.row.id) ? '已通知放學' : '通知放學' }}</el-dropdown-item>
                <el-dropdown-item command="graduate">畢業 / 轉出</el-dropdown-item>
                <el-dropdown-item command="delete" divided class="row-action-danger">刪除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="totalStudents > pageSize"
      class="student-pagination"
      background
      :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
      :pager-count="isMobile ? 5 : 7"
      :total="totalStudents"
      :page-size="pageSize"
      :current-page="currentPage"
      :page-sizes="[20, 50, 100]"
      @current-change="handlePageChange"
      @size-change="handleSizeChange"
    />

    <!-- 學生新增/編輯（統一使用 StudentEditDialog）-->
    <StudentEditDialog
      v-model:visible="editDialogVisible"
      :mode="editMode"
      :initial="editInitial"
      :default-classroom-id="pendingClassroomId"
      :classroom-options="dialogClassroomOptions"
      @saved="handleEditSaved"
    >
      <template #extra="{ classroomId, isEdit }">
        <BonusImpactPreview
          v-if="!isEdit && classroomId"
          operation="add"
          :classroom-id="classroomId"
        />
      </template>
    </StudentEditDialog>

    <!-- 畢業/轉出 Dialog -->
    <el-dialog v-model="graduateDialogVisible" :title="graduateBatchMode ? '批次設定離園' : '設定離園'" width="400px">
      <el-form :model="graduateForm" :rules="graduateRules" ref="graduateFormRef" label-width="90px">
        <el-form-item :label="graduateBatchMode ? '對象' : '學生姓名'">
          <span v-if="graduateBatchMode">已選 {{ selectedStudents.length }} 名學生</span>
          <span v-else>{{ graduateTarget?.name }}</span>
        </el-form-item>
        <el-form-item label="離園類型" prop="status">
          <el-radio-group v-model="graduateForm.status">
            <el-radio value="已畢業">畢業</el-radio>
            <el-radio value="已轉出">轉出</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="離園日期" prop="graduation_date">
          <el-date-picker
            v-model="graduateForm.graduation_date"
            type="date"
            placeholder="選擇日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="原因">
          <el-select v-model="graduateForm.reason" placeholder="選擇原因（選填）" clearable style="width: 100%">
            <el-option v-for="r in GRADUATE_REASON_OPTIONS[graduateForm.status] || []" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="graduateForm.notes" type="textarea" :rows="2" placeholder="補充說明（選填）" />
        </el-form-item>
      </el-form>
      <BonusImpactPreview
        v-if="graduateTarget?.classroom_id"
        operation="graduate"
        :source-classroom-id="graduateTarget.classroom_id"
      />
      <template #footer>
        <el-button @click="graduateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="graduateSubmitting" @click="submitGraduate">確認離園</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="transferDialogVisible" title="批次轉班" width="420px">
      <el-form label-width="100px">
        <el-form-item label="已選學生">
          <span>{{ selectedStudents.length }} 位</span>
        </el-form-item>
        <el-form-item label="來源班級">
          <span>{{ transferSourceClassroomId ? classroomName(transferSourceClassroomId) : '未分班' }}</span>
        </el-form-item>
        <el-form-item label="目標班級">
          <el-select v-model="transferTargetClassroomId" placeholder="選擇班級" style="width: 100%">
            <el-option
              v-for="c in assignableClassroomOptions"
              :key="c.id"
              :label="classroomLabel(c)"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <BonusImpactPreview
        v-if="transferTargetClassroomId"
        operation="transfer"
        :classroom-id="transferTargetClassroomId"
        :source-classroom-id="transferSourceClassroomId"
        :student-count="selectedStudents.length"
      />
      <template #footer>
        <el-button @click="transferDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferSubmitting" @click="submitTransfer">確認轉班</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-section { margin-bottom: var(--space-4); }
.filter-toolbar { display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-3); }
.filter-field { display: flex; flex-direction: column; gap: var(--space-2); flex: 1 1 10rem; min-width: 0; font-size: var(--text-sm); color: var(--text-secondary); }
.filter-field--classroom { flex-grow: 2; }
.classroom-option-setting { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-top: var(--space-2); }
.filter-hint { font-size: var(--text-xs); color: var(--text-secondary); }
.batch-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); padding: var(--space-3); margin-bottom: var(--space-3); border-radius: var(--radius-md); background: var(--el-color-primary-light-9); }
.batch-actions { display: flex; gap: var(--space-2); margin-left: auto; }
.student-pagination { margin-top: var(--space-4); justify-content: flex-end; }
.row-action-danger { color: var(--el-color-danger); }
@media (--to-sm) {
  .filter-field { flex-basis: 40%; }
  .filter-field--classroom { flex-basis: 100%; }
  .batch-actions { width: 100%; margin-left: 0; }
  .batch-actions :deep(.el-button) { flex: 1; min-height: var(--touch-target-min); }
  .student-pagination { justify-content: center; }
}
</style>
