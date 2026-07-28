<template>
  <div class="records-panel">
    <div class="panel-toolbar">
      <el-button v-if="canWrite" size="small" @click="openMonthDialog">管理月份</el-button>
      <el-button v-if="canWrite" type="primary" size="small" @click="openAddDialog">新增訪視記錄</el-button>
    </div>

    <RecruitmentDetailTab
      :can-write="canWrite"
      :can-convert="canConvert"
      :options="options"
      :filters="filter"
      :detail-data="detailData"
      :detail-total="detailTotal"
      :loading-detail="loadingDetail"
      :row-class-name="depositRowClass"
      @update-filter="updateDetailFilter"
      @filter-change="fetchDetail"
      @keyword-input="fetchDetailDebounced"
      @clear-filter="clearFilter"
      @page-change="onPageChange"
      @edit="openEditDialog"
      @delete="(id) => handleDelete(id as number)"
      @convert="openConvertDialog"
      @reserve="openReserveDialog"
      @journey="openJourney"
    />

    <!-- ==================== 管理月份 Dialog ==================== -->
    <RecruitmentMonthDialog
      v-model:visible="monthDialogVisible"
      @changed="handleMonthsChanged"
    />

    <!-- ==================== 新增/編輯訪視記錄 Dialog ==================== -->
    <RecruitmentRecordDialog
      v-model:visible="dialogVisible"
      :mode="dialogMode"
      :form="form"
      :saving="saving"
      :district-suggestions="districtSuggestions"
      :source-suggestions="((options.sources as string[] | undefined) || [])"
      :referrer-suggestions="((options.referrers as string[] | undefined) || [])"
      :no-deposit-reasons="((options.no_deposit_reasons as string[] | undefined) || [])"
      @save="handleSave"
    />

    <RecruitmentConvertDialog
      v-model="convertDialogVisible"
      :visit="castConvertVisit"
      :classroom-options="classroomOptions"
      @converted="onConverted"
    />

    <ReserveSeatDialog
      v-model="reserveDialogVisible"
      :visit="reserveTargetVisit"
      @reserved="onReserved"
    />

    <el-drawer v-model="journeyDrawerVisible" title="參觀→入學 歷程" direction="rtl" size="460px">
      <JourneyTimeline :visit-id="journeyVisitId" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  getRecruitmentRecords,
  createRecruitmentRecord,
  updateRecruitmentRecord,
  deleteRecruitmentRecord,
} from '@/api/recruitment'
import { apiError } from '@/utils/error'
import { hasPermission, getUserInfo } from '@/utils/auth'
import { useFormDraft } from '@/composables/useFormDraft'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import { useClassroomStore } from '@/stores/classroom'
import { toAdYear, getCurrentAcademicTerm } from '@/utils/academic'
import { emptyVisitForm, type VisitFormState } from '@/constants/recruitment'
import RecruitmentDetailTab from '@/components/recruitment/RecruitmentDetailTab.vue'
import RecruitmentMonthDialog from '@/components/recruitment/RecruitmentMonthDialog.vue'
import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'
import RecruitmentConvertDialog from '@/components/recruitment/RecruitmentConvertDialog.vue'
import ReserveSeatDialog from '@/components/recruitment/ReserveSeatDialog.vue'
import JourneyTimeline from '@/components/recruitment/JourneyTimeline.vue'

const props = defineProps<{
  dashboard: ReturnType<typeof useRecruitmentDashboard>
  filterPatch?: Record<string, unknown> | null
}>()
const emit = defineEmits<{ changed: [] }>()

const { options, stats, invalidateOptions, fetchOptions } = props.dashboard

// -------- 權限 --------
const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))
const canConvert = computed(() => hasPermission('RECRUITMENT_CONVERT'))

// -------- 轉化為學生 --------
const router = useRouter()
const convertDialogVisible = ref(false)
const convertTargetVisit = ref<Record<string, unknown> | null>(null)
const classroomOptions = ref<{ id: number; name: string }[]>([])
const classroomStore = useClassroomStore()

async function loadClassroomsOnce() {
  try {
    await classroomStore.fetchClassrooms()
    classroomOptions.value = (classroomStore.classrooms as { id: number; name: string }[]) || []
  } catch {
    // 失敗靜默：不阻擋 dialog 開啟，使用者仍可不選班級
    classroomOptions.value = []
  }
}

// ── 保留座位（暫定編班）─────────────────────────────
const reserveDialogVisible = ref(false)
const reserveTargetVisit = ref<Record<string, unknown> | null>(null)
function openReserveDialog(row: Record<string, unknown>) {
  reserveTargetVisit.value = row
  reserveDialogVisible.value = true
}
function onReserved() {
  // 重載訪視列表以反映 provisional 欄位變更
  void fetchDetail()
}

// ── 參觀→入學 歷程 ───────────────────────────────────
const journeyDrawerVisible = ref(false)
const journeyVisitId = ref<number | null>(null)
function openJourney(row: Record<string, unknown>) {
  journeyVisitId.value = (row.id as number) ?? null
  journeyDrawerVisible.value = true
}

async function openConvertDialog(row: Record<string, unknown>) {
  if (row?.enrolled) {
    ElMessage.warning('此訪視已標記為已註冊')
    return
  }
  convertTargetVisit.value = row
  await loadClassroomsOnce()
  convertDialogVisible.value = true
}

function onConverted(result: Record<string, unknown>) {
  // 更新此筆訪視記錄的 enrolled 狀態
  if (convertTargetVisit.value) {
    const targetId = convertTargetVisit.value.id
    const target = detailData.value.find((r) => r.id === targetId)
    if (target) target.enrolled = true
  }
  // 提供跳轉學生檔案的選項
  ElMessageBox.confirm(
    `學生已建立（ID #${result.student_id}），是否立即查看檔案？`,
    '轉化成功',
    { confirmButtonText: '查看檔案', cancelButtonText: '留在本頁', type: 'success' },
  )
    .then(() => {
      router.push({ name: 'student-profile', params: { id: String(result.student_id) } })
    })
    .catch(() => { /* 留在本頁 */ })
  emit('changed')
}

// -------- 狀態 --------
const loadingDetail = ref(false)
const saving = ref(false)

const detailData = ref<Record<string, unknown>[]>([])
const detailTotal = ref(0)
const filter = ref<{
  month: string | null
  grade: string | null
  source: string | null
  referrer: string | null
  has_deposit: boolean | null
  no_deposit_reason: string | null
  keyword: string
  page: number
  page_size: number
  school_year: number | null
  semester: number | null
  [key: string]: unknown
}>({
  month: null, grade: null, source: null, referrer: null,
  has_deposit: null, no_deposit_reason: null, keyword: '',
  page: 1, page_size: 50,
  school_year: null, semester: null,
})

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const fetchDetailDebounced = () => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchDetail(), 400)
}

// -------- 訪視記錄 Dialog --------
const dialogVisible = ref(false)
const dialogMode = ref('add')
const editingId = ref<number | null>(null)
const form = ref<VisitFormState>(emptyVisitForm())

// 表單草稿暫存：招生表單聯絡 PII 一律排除，草稿僅留訪視/年級/來源等工作欄位
const RECRUITMENT_DRAFT_EXCLUDE = [
  'child_name', 'birthday', 'phone', 'address', 'district',
  'parent_response', 'notes', 'month_raw',
]
const recruitmentDraft = useFormDraft({
  formId: 'recruitment',
  state: () => form.value,
  recordId: () => editingId.value,
  userScope: () => (getUserInfo()?.employee_id as string | number | null) || 'anon',
  exclude: RECRUITMENT_DRAFT_EXCLUDE,
  enabled: () => dialogVisible.value,
})

// -------- 管理月份 Dialog（MonthDialog 內部自行 load/add/delete，這裡只處理通知）--------
const monthDialogVisible = ref(false)
const openMonthDialog = () => { monthDialogVisible.value = true }

const handleMonthsChanged = async () => {
  invalidateOptions()
  await fetchOptions(true)
}

// -------- 日期轉換（僅保留 openEditDialog 還需要的兩個）--------
const rocDateToISO = (roc: string) => {
  if (!roc) return null
  const parts = roc.split('.')
  if (parts.length < 3) return null
  const year = toAdYear(parseInt(parts[0]))
  return `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
}
const rocMonthToISO = (rm: string) => {
  if (!rm) return null
  const parts = rm.split('.')
  if (parts.length < 2) return null
  const year = toAdYear(parseInt(parts[0]))
  return `${year}-${parts[1].padStart(2, '0')}`
}

// 訪視記錄對話框內的 form helpers（watch / _makeSuggestions / onDepositChange）
// 已搬到 RecruitmentRecordDialog.vue；這裡僅保留 district 建議清單的 computed。
const districtSuggestions = computed((): string[] =>
  ((stats.value.by_district as { district?: string }[] | undefined) || [])
    .map((d) => d.district)
    .filter((d): d is string => typeof d === 'string')
)

const fetchDetail = async () => {
  loadingDetail.value = true
  try {
    const params: Record<string, unknown> = { page: filter.value.page, page_size: filter.value.page_size }
    if (filter.value.month) params.month = filter.value.month
    if (filter.value.grade) params.grade = filter.value.grade
    if (filter.value.source) params.source = filter.value.source
    if (filter.value.referrer) params.referrer = filter.value.referrer
    if (filter.value.has_deposit !== null && filter.value.has_deposit !== undefined)
      params.has_deposit = filter.value.has_deposit
    if (filter.value.no_deposit_reason) params.no_deposit_reason = filter.value.no_deposit_reason
    if (filter.value.keyword) params.keyword = filter.value.keyword
    if (filter.value.school_year != null) params.school_year = filter.value.school_year
    if (filter.value.semester != null) params.semester = filter.value.semester

    const res = await getRecruitmentRecords(params)
    detailData.value = res.data.records
    detailTotal.value = res.data.total
    return true
  } catch (e) {
    ElMessage.error(apiError(e, '載入明細失敗'))
    return false
  } finally {
    loadingDetail.value = false
  }
}

// -------- 篩選 --------
const clearFilter = () => {
  filter.value = {
    ...filter.value,
    month: null, grade: null, source: null, referrer: null,
    has_deposit: null, no_deposit_reason: null, keyword: '', page: 1,
    school_year: null, semester: null,
  }
  fetchDetail()
}

const updateDetailFilter = (patch: Record<string, unknown>) => {
  filter.value = {
    ...filter.value,
    ...patch,
  }
}

const onPageChange = (page: number) => {
  filter.value.page = page
  fetchDetail()
}

// -------- 訪視記錄 CRUD --------
const openAddDialog = async () => {
  await fetchOptions()
  form.value = emptyVisitForm()
  dialogMode.value = 'add'
  editingId.value = null
  dialogVisible.value = true
  await nextTick()
  await recruitmentDraft.maybePromptRestore()
}

const openEditDialog = async (row: Record<string, unknown>) => {
  await fetchOptions()
  form.value = {
    month: String(row.month ?? ''),
    month_raw: rocDateToISO(String(row.visit_date ?? '')) ?? rocMonthToISO(String(row.month ?? '')),
    seq_no: String(row.seq_no ?? ''),
    visit_date: String(row.visit_date ?? ''),
    child_name: String(row.child_name ?? ''),
    birthday: (row.birthday ?? null) as string | null,
    grade: (row.grade ?? null) as string | null,
    phone: String(row.phone ?? ''),
    address: String(row.address ?? ''),
    district: String(row.district ?? ''),
    source: String(row.source ?? ''),
    referrer: String(row.referrer ?? ''),
    deposit_collector: String(row.deposit_collector ?? ''),
    has_deposit: Boolean(row.has_deposit),
    enrolled: Boolean(row.enrolled ?? false),
    transfer_term: Boolean(row.transfer_term ?? false),
    target_school_year: Number(row.target_school_year ?? getCurrentAcademicTerm().school_year),
    target_semester: (Number(row.target_semester ?? getCurrentAcademicTerm().semester) as 1 | 2),
    no_deposit_reason: (row.no_deposit_reason ?? null) as string | null,
    no_deposit_reason_detail: String(row.no_deposit_reason_detail ?? ''),
    notes: String(row.notes ?? ''),
    parent_response: String(row.parent_response ?? ''),
    geocoding_consent: Boolean(row.geocoding_consent ?? false),
  }
  dialogMode.value = 'edit'
  editingId.value = row.id as number | null
  dialogVisible.value = true
  await nextTick()
  await recruitmentDraft.maybePromptRestore()
}

const handleSave = async () => {
  // Dialog 內部已經驗證過表單（RecruitmentRecordDialog 的 handleSave）
  saving.value = true
  // 排除前端內部用的 month_raw，不送到後端
  const { month_raw: _mr, ...payload } = form.value
  try {
    if (dialogMode.value === 'add') {
      await createRecruitmentRecord(payload)
      ElMessage.success('新增成功')
    } else {
      await updateRecruitmentRecord(editingId.value!, payload)
      ElMessage.success('更新成功')
    }
    recruitmentDraft.clear()
    dialogVisible.value = false
    await fetchDetail()
    emit('changed')
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id: number) => {
  await ElMessageBox.confirm('確定刪除此筆記錄？', '確認', { type: 'warning', center: true })
  try {
    await deleteRecruitmentRecord(id)
    ElMessage.success('刪除成功')
    await fetchDetail()
    emit('changed')
  } catch (e) {
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}

// -------- 輔助函式 --------
const depositRowClass = (row: Record<string, unknown>) => row.has_deposit ? 'deposit-row' : ''

// -------- component / function 型別轉換（template 不支援複雜 union function 型別）--------
type VisitLike = { id: number | string; [key: string]: unknown }
const castConvertVisit = computed((): VisitLike | null => convertTargetVisit.value as VisitLike | null)

// 下鑽：父層切到本 tab 時帶 filterPatch
watch(
  () => props.filterPatch,
  (patch) => {
    if (!patch) return
    filter.value = {
      month: null, grade: null, source: null, referrer: null,
      has_deposit: null, no_deposit_reason: null, keyword: '',
      page: 1, page_size: filter.value.page_size,
      school_year: null, semester: null,
      ...patch,
    }
    void fetchDetail()
  },
)

onMounted(async () => {
  if (props.filterPatch) {
    filter.value = { ...filter.value, ...props.filterPatch, page: 1 }
  }
  await Promise.all([fetchDetail(), fetchOptions()])
})

defineExpose({ handleDelete, openAddDialog, fetchDetail })
</script>

<style scoped>
.panel-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
