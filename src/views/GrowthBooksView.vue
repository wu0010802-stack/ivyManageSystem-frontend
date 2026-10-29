<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getClassrooms } from '@/api/classrooms'
import { getGrowthBookBatchStatus, createGrowthBook } from '@/api/growthBooks'
// 成長報告族（下載／LINE 推播／刪除）沿用既有 src/api/studentGrowthReports.ts（Task 9 審查後定案），
// 不在 growthBooks.ts 重複這組 API surface。
import {
  sendGrowthReportToLine,
  downloadGrowthReportUrl,
  deleteGrowthReport,
} from '@/api/studentGrowthReports'
import GrowthBookCurationDrawer from '@/components/growthBook/GrowthBookCurationDrawer.vue'
import { growthBookErrorMessage } from '@/components/growthBook/errorMessage'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { apiError } from '@/utils/error'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { hasPermission } from '@/utils/auth'
import { formatDateTimeTW } from '@/utils/format'

// 後端 create_growth_book / send_growth_report_to_line 皆掛 Permission.PORTFOLIO_PUBLISH
// （非 PORTFOLIO_WRITE，對齊既有 GrowthReportTab.vue 的 canPublish 慣例）；
// 頁面進場僅需 PORTFOLIO_READ（見 router 權限規則），生成／推播動作額外收斂到 PUBLISH。
const canPublish = computed(() => hasPermission('PORTFOLIO_PUBLISH'))

const { isMobile } = useIsMobile()

// 輪詢間隔（後端 batch-status 一次呼叫約每生 8 個 query，過於頻繁會加重負載）
const POLL_INTERVAL_MS = 5000

interface MaterialSummary {
  observations: number
  work_samples: number
  photos: number
}

type GrowthBookStatus = 'none' | 'pending' | 'generating' | 'ready' | 'failed'

interface BatchStatusItem {
  student_id: number
  student_name: string
  status: GrowthBookStatus
  report_id: number | null
  line_sent_at: string | null
  material_summary: MaterialSummary
}

interface ClassroomOption {
  id: number
  name: string
}

/** 批次動作中失敗的學生與原因（留在頁面上，不像 toast 幾秒就消失）。 */
interface BatchFailure {
  student_id: number
  name: string
  reason: string
}

/** 列上的操作按鈕；桌機表格與手機卡片共用同一份定義，避免兩邊條件漂移。 */
interface RowAction {
  key: 'generate' | 'curate' | 'download' | 'send' | 'rebuild'
  label: string
  onClick: () => void
  emphasis?: 'primary' | 'danger'
  loading?: boolean
  disabled?: boolean
  hint?: string
}

const route = useRoute()
const router = useRouter()

const classrooms = ref<ClassroomOption[]>([])
const classroomsLoading = ref(false)
const classroomsError = ref(false)
const classroomId = ref<number | null>(
  route.query.classroom_id ? Number(route.query.classroom_id) : null,
)
const academicYear = ref<number>(
  route.query.academic_year ? Number(route.query.academic_year) : getCurrentAcademicTerm().school_year,
)
const periodLabel = ref('')
const items = ref<BatchStatusItem[]>([])
const loading = ref(false)
// 最近一次載入失敗。沒有舊列時顯示整頁錯誤態；已有舊列時保留並提示「可能不是最新」。
const loadError = ref(false)
// 目前「班級＋學年度」是否至少成功載入過一次，用來分辨「還沒載」與「載了但沒有人」。
const hasLoaded = ref(false)

// 單筆按鈕 loading 防雙擊，以 student_id 為 key
const rowLoading = ref<Record<number, boolean>>({})

const batchGenerating = ref(false)
const batchSending = ref(false)
const generateProgress = ref<{ done: number; total: number } | null>(null)
const sendProgress = ref<{ done: number; total: number } | null>(null)
const batchFailures = ref<{ kind: '生成' | '推播'; rows: BatchFailure[] } | null>(null)

const curation = ref<{ visible: boolean; studentId: number | null; studentName: string }>({
  visible: false,
  studentId: null,
  studentName: '',
})

function openCuration(row: BatchStatusItem) {
  curation.value = { visible: true, studentId: row.student_id, studentName: row.student_name }
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let loadEpoch = 0

const STATUS_LABEL: Record<GrowthBookStatus, string> = {
  none: '尚未建立',
  pending: '生成中',
  generating: '生成中',
  ready: '可下載',
  failed: '生成失敗',
}
const STATUS_TAG_TYPE: Record<GrowthBookStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  none: 'info',
  pending: 'warning',
  generating: 'warning',
  ready: 'success',
  failed: 'danger',
}

function statusLabel(status: GrowthBookStatus) {
  return STATUS_LABEL[status] ?? status
}
function statusTagType(status: GrowthBookStatus) {
  return STATUS_TAG_TYPE[status] ?? 'info'
}

async function loadClassrooms() {
  classroomsLoading.value = true
  classroomsError.value = false
  try {
    const r = await getClassrooms()
    // 後端未標 response_model 情境已由 schema 收斂為 ClassroomListItemOut[]，此處僅取需要欄位
    classrooms.value = (r.data ?? []) as unknown as ClassroomOption[]
  } catch (e) {
    classroomsError.value = true
    ElMessage.error(apiError(e, '讀取班級列表失敗'))
  } finally {
    classroomsLoading.value = false
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function maybeStartPolling() {
  const hasActive = items.value.some(
    (i) => i.status === 'pending' || i.status === 'generating',
  )
  if (hasActive) {
    if (!pollTimer) {
      // 背景輪詢不顯示整表 loading，也不鎖住批次按鈕，避免每 5 秒閃一次
      pollTimer = setInterval(() => { void load({ silent: true }) }, POLL_INTERVAL_MS)
    }
  } else {
    stopPolling()
  }
}

async function load(options: { silent?: boolean } = {}) {
  const requestEpoch = ++loadEpoch
  const requestedClassroomId = classroomId.value
  const requestedAcademicYear = academicYear.value
  if (!requestedClassroomId || !requestedAcademicYear) {
    loading.value = false
    return
  }
  if (!options.silent) loading.value = true
  try {
    const r = await getGrowthBookBatchStatus({
      classroom_id: requestedClassroomId,
      academic_year: requestedAcademicYear,
    })
    if (
      requestEpoch !== loadEpoch
      || classroomId.value !== requestedClassroomId
      || academicYear.value !== requestedAcademicYear
    ) return
    // 後端 GET /growth-books/batch-status 未標 response_model，型別退為 unknown，
    // 依 CLAUDE.md 慣例以本地 interface 明確標註等候補齊後端 schema。
    const data = r.data as unknown as { items: BatchStatusItem[]; period_label: string }
    items.value = data.items ?? []
    periodLabel.value = data.period_label ?? ''
    loadError.value = false
    hasLoaded.value = true
    maybeStartPolling()
  } catch (e) {
    if (requestEpoch !== loadEpoch) return
    loadError.value = true
    // 失敗就停止背景輪詢：否則每 5 秒重打一次並重複彈出同一則錯誤
    stopPolling()
    ElMessage.error(apiError(e, '讀取成長冊狀態失敗'))
  } finally {
    // 最新一次請求不論是否 silent 都負責收掉 loading，
    // 避免「手動載入被背景輪詢蓋過」後 loading 卡住
    if (requestEpoch === loadEpoch) loading.value = false
  }
}

function onSearch() {
  stopPolling()
  items.value = []
  periodLabel.value = ''
  loadError.value = false
  hasLoaded.value = false
  batchFailures.value = null
  router.push({
    query: {
      ...route.query,
      classroom_id: classroomId.value ?? undefined,
      academic_year: academicYear.value,
    },
  })
  void load()
}

// 學年度欄被清空時 el-input-number 會 emit null，直接送出會打到後端 422；退回本學年度。
function onYearChange(value: number | null | undefined) {
  if (!value) academicYear.value = getCurrentAcademicTerm().school_year
  onSearch()
}

function reload() {
  void load()
}

// ---------- 摘要與批次目標 ----------

const generateTargets = computed(() =>
  items.value.filter((i) => i.status === 'none' || i.status === 'failed'),
)
const sendTargets = computed(() =>
  items.value.filter((i) => i.status === 'ready' && i.report_id != null && !i.line_sent_at),
)
const inProgressCount = computed(() =>
  items.value.filter((i) => i.status === 'pending' || i.status === 'generating').length,
)
const readyCount = computed(() => items.value.filter((i) => i.status === 'ready').length)
const sentCount = computed(() => items.value.filter((i) => !!i.line_sent_at).length)

// 一頁一個主要動作：還有人沒生成 → 「全班一鍵生成」；都生成完 → 「全班推播」
const generateIsPrimary = computed(() => generateTargets.value.length > 0)
const sendIsPrimary = computed(() => !generateIsPrimary.value && sendTargets.value.length > 0)

const batchBusy = computed(() => batchGenerating.value || batchSending.value)
const batchDisabled = computed(
  () => loading.value || !classroomId.value || loadError.value || items.value.length === 0,
)

function progressPct(p: { done: number; total: number } | null) {
  if (!p || p.total === 0) return 0
  return Math.round((p.done / p.total) * 100)
}

// ---------- 單筆動作 ----------

async function onGenerate(row: BatchStatusItem) {
  if (!canPublish.value) return
  // 批次生成／推播進行到一半時，未輪到的學生列按鈕也要鎖住，避免使用者手動點擊
  // 造成重複送出（後端 409、彈出誤導性錯誤）；:disabled 已擋 UI，這裡再擋一層防呆。
  if (batchBusy.value) return
  if (rowLoading.value[row.student_id]) return
  rowLoading.value[row.student_id] = true
  try {
    await createGrowthBook(row.student_id, { academic_year: academicYear.value })
    ElMessage.success(`已開始為${row.student_name}生成成長冊，完成後可下載`)
    await load()
  } catch (e) {
    ElMessage.error(growthBookErrorMessage(e, '建立失敗'))
  } finally {
    rowLoading.value[row.student_id] = false
  }
}

function onDownload(row: BatchStatusItem) {
  if (row.report_id == null) return
  window.open(downloadGrowthReportUrl(row.student_id, row.report_id), '_blank', 'noopener')
}

async function onSendLine(row: BatchStatusItem) {
  if (!canPublish.value) return
  if (row.report_id == null) return
  if (batchBusy.value) return
  if (rowLoading.value[row.student_id]) return
  const resend = row.line_sent_at ? '這份成長冊已推播過，再推一次家長會收到第二則通知。' : ''
  try {
    await ElMessageBox.confirm(
      `${resend}${row.student_name}的家長會立即在 LINE 收到成長冊，送出後無法收回。`,
      '推播成長冊給家長',
      { confirmButtonText: '推播', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 使用者取消
  }
  rowLoading.value[row.student_id] = true
  try {
    const r = await sendGrowthReportToLine(row.student_id, row.report_id)
    ElMessage.success(`已推播${r.data?.sent_count != null ? ` ${r.data.sent_count} 位家長` : ''}`)
    await load()
  } catch (e) {
    ElMessage.error(`${row.student_name}推播失敗：${apiError(e, '請稍後再試')}`)
  } finally {
    rowLoading.value[row.student_id] = false
  }
}

// 後端同學年只允許一本成長冊（409），要換內容只能先刪舊冊再生成。
// 以前「策展」對已完成的冊也開放，使用者挑完內容按生成必定撞 409，且列表沒有刪除入口。
async function onRebuild(row: BatchStatusItem) {
  if (!canPublish.value) return
  if (row.report_id == null) return
  if (batchBusy.value) return
  if (rowLoading.value[row.student_id]) return
  const sent = row.line_sent_at ? '這份已推播給家長，刪除後家長端也會看不到它。' : ''
  try {
    await ElMessageBox.confirm(
      `${sent}將刪除${row.student_name}目前的成長冊檔案（無法復原），接著讓你重新挑選內容再生成。`,
      '重新製作成長冊',
      { confirmButtonText: '刪除並重做', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 使用者取消
  }
  rowLoading.value[row.student_id] = true
  try {
    await deleteGrowthReport(row.student_id, row.report_id)
  } catch (e) {
    ElMessage.error(`刪除${row.student_name}的舊成長冊失敗：${apiError(e, '請稍後再試')}`)
    return
  } finally {
    rowLoading.value[row.student_id] = false
  }
  ElMessage.success('舊成長冊已刪除，請重新挑選內容')
  await load()
  openCuration(row)
}

function rowActions(row: BatchStatusItem): RowAction[] {
  const actions: RowAction[] = []
  const locked = batchBusy.value
  const busy = !!rowLoading.value[row.student_id]
  const notBuilt = row.status === 'none' || row.status === 'failed'
  if (canPublish.value && notBuilt) {
    actions.push({
      key: 'generate',
      label: '一鍵生成',
      hint: '由系統自動挑選照片、作品與觀察紀錄並生成成長冊',
      emphasis: 'primary',
      loading: busy,
      disabled: locked,
      onClick: () => onGenerate(row),
    })
    actions.push({
      key: 'curate',
      label: '挑選內容',
      hint: '自己挑選要放進成長冊的封面、照片、作品與觀察紀錄',
      onClick: () => openCuration(row),
    })
  }
  if (row.status === 'ready') {
    actions.push({
      key: 'download',
      label: '下載',
      emphasis: 'primary',
      onClick: () => onDownload(row),
    })
    if (canPublish.value) {
      actions.push({
        key: 'send',
        label: row.line_sent_at ? '再次推播' : '推播 LINE',
        hint: '把成長冊傳到家長的 LINE',
        loading: busy,
        disabled: locked,
        onClick: () => onSendLine(row),
      })
      actions.push({
        key: 'rebuild',
        label: '重新製作',
        hint: '刪除目前的成長冊，重新挑選內容再生成',
        emphasis: 'danger',
        loading: busy,
        disabled: locked,
        onClick: () => onRebuild(row),
      })
    }
  }
  return actions
}

// ---------- 批次動作 ----------

function summarizeFailures(kind: '生成' | '推播', failures: BatchFailure[], total: number) {
  batchFailures.value = failures.length ? { kind, rows: failures } : null
  if (failures.length === 0) {
    ElMessage.success(`批次${kind}完成，共 ${total} 位`)
  } else {
    ElMessage.warning(
      `批次${kind}完成，${total - failures.length} 位成功、${failures.length} 位失敗（原因列在頁面上方）`,
    )
  }
}

async function onBatchGenerate() {
  if (!canPublish.value) return
  if (loading.value) return
  if (batchBusy.value) return
  const targets = [...generateTargets.value]
  if (targets.length === 0) {
    ElMessage.info('目前沒有需要生成的學生')
    return
  }
  batchFailures.value = null
  batchGenerating.value = true
  generateProgress.value = { done: 0, total: targets.length }
  const failures: BatchFailure[] = []
  for (const row of targets) {
    try {
      await createGrowthBook(row.student_id, { academic_year: academicYear.value })
    } catch (e) {
      failures.push({
        student_id: row.student_id,
        name: row.student_name,
        reason: growthBookErrorMessage(e, '建立失敗'),
      })
    }
    generateProgress.value = { done: generateProgress.value.done + 1, total: targets.length }
  }
  batchGenerating.value = false
  generateProgress.value = null
  summarizeFailures('生成', failures, targets.length)
  await load()
}

async function onBatchSendLine() {
  if (!canPublish.value) return
  if (loading.value) return
  if (batchBusy.value) return
  const targets = [...sendTargets.value]
  if (targets.length === 0) {
    ElMessage.info('目前沒有需要推播的學生')
    return
  }
  try {
    await ElMessageBox.confirm(
      `將把成長冊推播給 ${targets.length} 位學生的家長（已推播過的不會重複），家長會立即在 LINE 收到，送出後無法收回。`,
      '全班推播成長冊',
      { confirmButtonText: `推播 ${targets.length} 位`, cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 使用者取消
  }
  batchFailures.value = null
  batchSending.value = true
  sendProgress.value = { done: 0, total: targets.length }
  const failures: BatchFailure[] = []
  for (const row of targets) {
    try {
      await sendGrowthReportToLine(row.student_id, row.report_id as number)
    } catch (e) {
      failures.push({
        student_id: row.student_id,
        name: row.student_name,
        reason: apiError(e, '推播失敗'),
      })
    }
    sendProgress.value = { done: sendProgress.value.done + 1, total: targets.length }
  }
  batchSending.value = false
  sendProgress.value = null
  summarizeFailures('推播', failures, targets.length)
  await load()
}

// ---------- 手機卡片 ----------

const MOBILE_CARD_COLUMNS = [
  { label: '素材', prop: 'material_summary' },
  { label: '狀態', prop: 'status' },
]
const cardItems = computed(() => items.value as unknown as Record<string, unknown>[])
function asRow(item: Record<string, unknown>): BatchStatusItem {
  return item as unknown as BatchStatusItem
}

function sentTitle(row: BatchStatusItem) {
  return `${formatDateTimeTW(row.line_sent_at)} 已推播給家長`
}

onMounted(() => {
  loadClassrooms()
  if (classroomId.value) load()
})
onUnmounted(() => {
  loadEpoch += 1
  stopPolling()
})

// Expose for tests（<script setup> 預設不對外露出 setup 綁定）
defineExpose({ classroomId, academicYear, load, items, classrooms })
</script>

<template>
  <div class="growth-books-view">
    <PageHeader
      title="成長冊工作台"
      subtitle="為班上每位幼生製作本學年度成長冊（PDF），確認後推播給家長。「一鍵生成」由系統自動挑素材；想自己挑照片、作品，用「挑選內容」。"
    >
      <template v-if="canPublish" #actions>
        <el-button
          :type="generateIsPrimary ? 'primary' : 'default'"
          :disabled="batchDisabled || batchSending || generateTargets.length === 0"
          :loading="batchGenerating"
          :title="generateTargets.length === 0 ? '目前沒有需要生成的學生' : undefined"
          data-test="batch-generate"
          @click="onBatchGenerate"
        >
          全班一鍵生成
          <span v-if="generateProgress">（{{ generateProgress.done }}/{{ generateProgress.total }}）</span>
          <span v-else-if="generateTargets.length">（{{ generateTargets.length }} 位）</span>
        </el-button>
        <el-button
          :type="sendIsPrimary ? 'primary' : 'default'"
          :disabled="batchDisabled || batchGenerating || sendTargets.length === 0"
          :loading="batchSending"
          :title="sendTargets.length === 0 ? '目前沒有可推播（已生成且未推播）的學生' : undefined"
          data-test="batch-send"
          @click="onBatchSendLine"
        >
          全班推播
          <span v-if="sendProgress">（{{ sendProgress.done }}/{{ sendProgress.total }}）</span>
          <span v-else-if="sendTargets.length">（{{ sendTargets.length }} 位）</span>
        </el-button>
      </template>
      <template #filters>
        <span class="filter-label">班級</span>
        <el-select
          v-model="classroomId"
          placeholder="選擇班級"
          class="filter-classroom"
          clearable
          aria-label="班級"
          :loading="classroomsLoading"
          @change="onSearch"
        >
          <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <span class="filter-label">學年度</span>
        <el-input-number
          v-model="academicYear"
          :min="100"
          :max="150"
          :controls="false"
          class="filter-year"
          aria-label="學年度"
          @change="onYearChange"
        />
        <el-button :loading="loading" :disabled="!classroomId" data-test="reload" @click="reload">
          重新整理
        </el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="classroomsError"
      type="error"
      :closable="false"
      show-icon
      title="班級清單載入失敗，暫時無法選擇班級"
      data-test="classrooms-error"
    >
      <el-button size="small" :loading="classroomsLoading" @click="loadClassrooms">重新載入班級</el-button>
    </el-alert>

    <el-alert
      v-if="batchFailures"
      type="error"
      show-icon
      :title="`${batchFailures.kind}失敗 ${batchFailures.rows.length} 位，其餘已完成`"
      data-test="batch-failures"
      @close="batchFailures = null"
    >
      <ul class="failure-list">
        <li v-for="f in batchFailures.rows" :key="f.student_id">{{ f.name }}：{{ f.reason }}</li>
      </ul>
    </el-alert>

    <el-alert
      v-if="loadError && items.length > 0"
      type="warning"
      :closable="false"
      show-icon
      title="成長冊狀態更新失敗，下方內容可能不是最新的"
      data-test="stale-warning"
    >
      <el-button size="small" :loading="loading" @click="reload">重新載入</el-button>
    </el-alert>

    <div v-if="generateProgress || sendProgress" class="batch-progress-area">
      <el-progress
        v-if="generateProgress"
        :percentage="progressPct(generateProgress)"
        :stroke-width="10"
        class="batch-progress"
      />
      <el-progress
        v-if="sendProgress"
        :percentage="progressPct(sendProgress)"
        :stroke-width="10"
        class="batch-progress"
      />
    </div>

    <p v-if="hasLoaded && items.length > 0" class="summary-line" data-test="summary">
      {{ periodLabel }}：共 {{ items.length }} 位　尚未建立 {{ generateTargets.length }}　生成中 {{ inProgressCount }}　可下載 {{ readyCount }}（已推播 {{ sentCount }}）
      <span v-if="inProgressCount > 0" class="summary-hint">　生成中的會每 5 秒自動更新</span>
    </p>

    <EmptyState
      v-if="!classroomId"
      title="請先選擇班級"
      description="選好班級後，會列出每位幼生的成長冊製作進度。"
      data-test="pick-classroom"
    />

    <EmptyState
      v-else-if="loadError && items.length === 0"
      variant="error"
      title="成長冊狀態載入失敗"
      description="在重新載入成功前，請不要當作這個班級沒有資料或還沒製作。"
      data-test="load-error"
    >
      <template #action>
        <el-button type="primary" :loading="loading" @click="reload">重新載入</el-button>
      </template>
    </EmptyState>

    <TableSkeleton v-else-if="!hasLoaded" :columns="4" :rows="5" />

    <EmptyState
      v-else-if="items.length === 0"
      title="這個班級目前沒有在學的幼生"
      description="換一個班級，或到「班級管理」確認幼生是否已編入此班。"
      data-test="empty-class"
    />

    <AdminListCards
      v-else-if="isMobile"
      :items="cardItems"
      :columns="MOBILE_CARD_COLUMNS"
      row-key="student_id"
      class="growth-books-cards"
    >
      <template #title="{ item }">{{ asRow(item).student_name }}</template>
      <template #cell-material_summary="{ item }">
        觀察 {{ asRow(item).material_summary.observations }}・作品 {{ asRow(item).material_summary.work_samples }}・照片 {{ asRow(item).material_summary.photos }}
      </template>
      <template #cell-status="{ item }">
        <el-tag :type="statusTagType(asRow(item).status)">{{ statusLabel(asRow(item).status) }}</el-tag>
        <el-tag
          v-if="asRow(item).line_sent_at"
          type="success"
          class="pushed-tag"
          :title="sentTitle(asRow(item))"
        >已推播</el-tag>
      </template>
      <template #actions="{ item }">
        <el-button
          v-for="a in rowActions(asRow(item))"
          :key="a.key"
          :type="a.emphasis"
          :loading="a.loading"
          :disabled="a.disabled"
          :title="a.hint"
          :aria-label="`${a.label}：${asRow(item).student_name}`"
          @click="a.onClick"
        >{{ a.label }}</el-button>
      </template>
    </AdminListCards>

    <el-table v-else :data="items" v-loading="loading" class="growth-books-table">
      <el-table-column prop="student_name" label="姓名" width="120" />
      <el-table-column label="素材摘要" min-width="180">
        <template #default="{ row }">
          觀察 {{ row.material_summary.observations }}・作品 {{ row.material_summary.work_samples }}・照片 {{ row.material_summary.photos }}
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="180">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          <el-tag
            v-if="row.line_sent_at"
            type="success"
            class="pushed-tag"
            :title="sentTitle(row)"
          >已推播</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="300">
        <template #default="{ row }">
          <el-button
            v-for="a in rowActions(row)"
            :key="a.key"
            size="small"
            link
            :type="a.emphasis"
            :loading="a.loading"
            :disabled="a.disabled"
            :title="a.hint"
            :aria-label="`${a.label}：${row.student_name}`"
            @click="a.onClick"
          >
            {{ a.label }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <GrowthBookCurationDrawer
      v-model="curation.visible"
      :student-id="curation.studentId ?? 0"
      :student-name="curation.studentName"
      :academic-year="academicYear"
      @generated="load"
    />
  </div>
</template>

<style scoped>
.growth-books-view {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* PageHeader 自帶底部 margin，與 flex gap 疊加會過空；篩選列貼近標題 */
.growth-books-view :deep(.page-header) {
  margin-bottom: 0;
}
.growth-books-view :deep(.filter-bar) {
  margin-bottom: 0;
}
.filter-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.filter-classroom {
  width: 200px;
}
.filter-year {
  width: 120px;
}
.summary-line {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.summary-hint {
  color: var(--el-color-warning);
}
.failure-list {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.6;
}
.batch-progress-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.batch-progress {
  max-width: 320px;
}
.growth-books-table {
  width: 100%;
}
.pushed-tag {
  margin-left: 4px;
}

@media (--to-sm) {
  .filter-classroom {
    flex: 1 1 140px;
    min-width: 0;
  }
  .filter-year {
    width: 100px;
  }
  .batch-progress {
    max-width: none;
  }
}
</style>
