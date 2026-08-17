<script setup lang="ts">
/**
 * CycleDetailPanel — 單一考核週期明細（內嵌元件）
 *
 * 原 CycleDetailView 分頁元件化（2026-07-04 spec）：cycleId 改由 prop 傳入、
 * 預設 view 改 list（歷史週期 tab 進頁即列表模式）、移除 el-page-header。
 * 父層以 :key="cycleId" 重掛切換週期。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Download } from '@element-plus/icons-vue'

import {
  listAppraisalParticipants,
  listAppraisalSummaries,
  listAppraisalCatalog,
  recomputeAppraisalSummaries,
  signSupervisorAppraisalSummary,
  signAccountingAppraisalSummary,
  finalizeAppraisalSummary,
  listAppraisalCycles,
  exportAppraisalCycleXlsxUrl,
  exportAppraisalTransferRosterXlsxUrl,
  getSignStatusSummary,
  getAppraisalAllEmployeesStatus,
  listScoringRules,
} from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { statusLabel, MSG } from '@/constants/appraisalYearEnd'

import KanbanView from './components/KanbanView.vue'
import ListView from './components/ListView.vue'
import RejectDialog from './components/RejectDialog.vue'
import CommentDialog from './components/CommentDialog.vue'
import BatchSignButton from './components/BatchSignButton.vue'
import SummaryLogDrawer from './components/SummaryLogDrawer.vue'
import SignProgressBar from '@/views/appraisalYearEnd/components/SignProgressBar.vue'
import AggregatedStatusDetailDialog from './AggregatedStatusDetailDialog.vue'

interface Cycle { id: number; academic_year?: number; semester?: string; base_score_calc_date?: string; base_score?: number; status?: string; [key: string]: unknown }
interface Participant { id: number; employee_id?: number; role_group?: string; employee_name?: string; [key: string]: unknown }
interface Summary { id: number; participant_id?: number; status?: string; total_score?: number; grade?: string; bonus_amount?: number; employee_name?: string; [key: string]: unknown }
interface AggregatedParticipant {
  employee_id?: number
  employee_name?: string
  role_group?: string
  reinstate_count?: number
  attendance?: Record<string, unknown>
  retention?: Record<string, unknown> | null
  activity?: Record<string, unknown> | null
  disciplinary?: Record<string, unknown>
  [key: string]: unknown
}

const props = defineProps<{ cycleId: number }>()

const route = useRoute()
const router = useRouter()
const cycleId = computed(() => props.cycleId)

const cycle = ref<Cycle | null>(null)
const participants = ref<Participant[]>([])
const summaries = ref<Summary[]>([])
const catalog = ref<unknown[]>([])
const loading = ref(false)
const busy = ref(false)
const aggregatedParticipants = ref<AggregatedParticipant[]>([])
const rulesByCode = ref<Record<string, unknown>>({})
const detailDialogVisible = ref(false)
const detailTarget = ref<AggregatedParticipant | null>(null)

// Task 8：頂部簽核進度列 counts（getSignStatusSummary 獨立於 kanban 自己的
// data，list view 沒有 kanban 可看，故獨立載入才能兩種 view 都顯示進度）。
const signCounts = ref<Record<string, number>>({})
async function loadSignCounts() {
  try {
    const r = await getSignStatusSummary(cycleId.value)
    signCounts.value = (r.data as { counts?: Record<string, number> })?.counts ?? {}
  } catch (e) {
    // 進度列非關鍵路徑，載入失敗不擋頁面其餘功能。
    console.error(e)
  }
}

// P1-9：view 用 URL query 同步，F5 後保留、可分享。
// 內嵌後預設 list（需求：進頁即列表模式），query 仍可覆寫成 kanban。
const VALID_VIEWS = ['kanban', 'list']
const initialQueryView = String(route?.query?.view ?? '')
const initialView = VALID_VIEWS.includes(initialQueryView) ? initialQueryView : 'list'
const view = ref(initialView)
const selectedIds = ref<number[]>([])

// view 切換時：① 同步 URL query ② 清空 selectedIds（兩 view 的 id 來源不同）
watch(view, (next) => {
  selectedIds.value = []
  if (router?.replace) {
    router.replace({ query: { ...(route?.query || {}), view: next } })
  }
})

// P1-14：以 ref<Array<id>> 追蹤每張卡正在簽核中的狀態，
// 用 Set 包裝避免 race；toolbar busy 改為 isRecomputing 專用。
const signingIds = ref<number[]>([])
const isSigning = (summaryId: number) => signingIds.value.includes(summaryId)

const summaryByParticipant = computed(() => {
  const m: Record<number, Summary> = {}
  for (const s of summaries.value) if (s.participant_id != null) m[s.participant_id] = s
  return m
})

// P1-6：以 summary.id 為 key，給 BatchSignButton 的失敗清單 dialog
// 拿 employee_name 顯示而非裸 summary_id。
const summariesById = computed(() => {
  const m: Record<number, Summary> = {}
  for (const s of summaries.value) m[s.id] = s
  return m
})

// P0-A：依後端 APPRAISAL_* 細粒度 permission bit 守衛 UI 動作。
// `canBatchSign` 任一階段簽核權限即可顯示批次區（個別按鈕再各自守衛）。
const canRecompute = computed(() => hasPermission('APPRAISAL_EVENT_WRITE'))
const canSignSupervisor = computed(() => hasPermission('APPRAISAL_REVIEW'))
const canSignAccounting = computed(() => hasPermission('APPRAISAL_ACCOUNTING'))
const canFinalize = computed(() => hasPermission('APPRAISAL_FINALIZE'))
const canBatchSign = computed(
  () => canSignSupervisor.value || canSignAccounting.value || canFinalize.value,
)
// 退簽：後端 endpoint 入口僅要 APPRAISAL_READ 但依當前 stage 再 check 對應 sign
// 權限；UI 守衛保守用 OR 三個 sign 權限（任一即可顯示，後端會二次驗）。
const canReject = computed(() => canBatchSign.value)

// statusLabel 從 ./labels 集中載入（P2 i18n 過渡）

async function load() {
  loading.value = true
  try {
    // 五支彼此無資料依賴（皆只吃 cycleId 或無參）→ 併發載入，首載等待取最慢者
    // 而非五次 round-trip 相加（比照 yearEnd/YearEndDetailView.vue load()）。
    const [cyclesRes, participantsRes, summariesRes, catalogRes, statusRes] = await Promise.all([
      listAppraisalCycles(),
      listAppraisalParticipants(cycleId.value),
      listAppraisalSummaries(cycleId.value),
      listAppraisalCatalog(),
      getAppraisalAllEmployeesStatus(cycleId.value),
    ])
    const cycles = cyclesRes.data as unknown as Cycle[]
    cycle.value = cycles.find((c) => c.id === cycleId.value) || null
    participants.value = participantsRes.data as Participant[]
    summaries.value = summariesRes.data as Summary[]
    catalog.value = catalogRes.data as unknown[]
    aggregatedParticipants.value = (statusRes.data as { participants?: AggregatedParticipant[] })?.participants ?? []
    loadRules()
  } catch (e) {
    ElMessage.error(apiError(e, MSG.load_failed))
  } finally {
    loading.value = false
  }
}

// 詳情 dialog 的規則 tooltip 用資料，比照 CurrentSemesterOverview.vue 既有作法：
// 失敗不影響主流程，rulesByCode 留空 dict、dialog 內 tooltip 自動隱藏。
async function loadRules() {
  if (!cycle.value?.base_score_calc_date) { rulesByCode.value = {}; return }
  try {
    const { data } = await listScoringRules(cycle.value.base_score_calc_date)
    const list: { item_code?: string; [key: string]: unknown }[] = Array.isArray(data) ? data : ((data as { rules?: unknown[] })?.rules || [])
    rulesByCode.value = Object.fromEntries(list.map((r) => [r.item_code, r]))
  } catch {
    rulesByCode.value = {}
  }
}

function openDetail(employeeId?: number) {
  if (employeeId == null) return
  const row = aggregatedParticipants.value.find((p) => p.employee_id === employeeId)
  if (!row) {
    ElMessage.warning('找不到明細資料，請重新整理後再試')
    return
  }
  detailTarget.value = row
  detailDialogVisible.value = true
}

const kanbanRef = ref<{ reload?: () => void } | null>(null)
async function reload() {
  await load()
  loadSignCounts()
  if (kanbanRef.value?.reload) kanbanRef.value.reload()
}

// P1-14：背景非阻塞重新整理 kanban，不動 summaries / participants /
// catalog（這些只在初次載入或 reject/comment/recompute 後才需要重撈）。
// Task 8：簽核進度列 counts 掛在同一個背景刷新點，簽核/退簽/留言後一併更新。
function silentKanbanRefresh() {
  loadSignCounts()
  if (kanbanRef.value?.reload) {
    // 不 await — 不阻塞 UI；錯誤交給 kanban 自己的 try/catch
    kanbanRef.value.reload()
  }
}

async function recompute() {
  busy.value = true
  try {
    await recomputeAppraisalSummaries(cycleId.value)
    ElMessage.success(MSG.recompute_success)
    await reload()
  } catch (e) {
    ElMessage.error(apiError(e, MSG.recompute_failed))
  } finally {
    busy.value = false
  }
}

// P1-14：簽核成功後改採局部 patch + 背景 kanban refresh，
// 不再觸發 4 個 API 全量 reload。
const STAGE_TO_NEXT_STATUS = {
  supervisor: 'SUPERVISOR_SIGNED',
  accounting: 'ACCOUNTING_SIGNED',
  finalize: 'FINALIZED',
}

// P1-14：reject 成功後局部 patch summary.status，避免 4 個 API 全 reload
function onRejected({ summaryId, newStatus }: { summaryId?: number; newStatus?: string } = {}) {
  if (summaryId && newStatus) {
    const idx = summaries.value.findIndex((s) => s.id === summaryId)
    if (idx >= 0) {
      summaries.value[idx] = { ...summaries.value[idx], status: newStatus }
    }
  }
  silentKanbanRefresh()
}

// P1-14：comment 不改 status，只刷 kanban（聊天計數等）
function onCommented() {
  silentKanbanRefresh()
}

async function sign({ summary, stage }: { summary: { id: number }; stage: string }) {
  const id = summary.id
  // 重複 click 防護
  if (signingIds.value.includes(id)) return
  signingIds.value = [...signingIds.value, id]
  try {
    if (stage === 'supervisor') await signSupervisorAppraisalSummary(id)
    else if (stage === 'accounting') await signAccountingAppraisalSummary(id)
    else if (stage === 'finalize') await finalizeAppraisalSummary(id)
    ElMessage.success(MSG.sign_success)
    // 局部 patch：更新本地 summaries 該筆的 status，UI 立刻反映新狀態
    const nextStatus = (STAGE_TO_NEXT_STATUS as Record<string, string>)[stage]
    if (nextStatus) {
      const idx = summaries.value.findIndex((s) => s.id === id)
      if (idx >= 0) {
        summaries.value[idx] = { ...summaries.value[idx], status: nextStatus }
      }
    }
    // 背景非阻塞 refresh kanban（其 buckets 結構獨立）
    silentKanbanRefresh()
  } catch (e) {
    ElMessage.error(apiError(e, MSG.sign_failed))
  } finally {
    signingIds.value = signingIds.value.filter((x) => x !== id)
  }
}

const rejectDialogVisible = ref(false)
const rejectTarget = ref<Summary | null>(null)
function openReject(summary: Summary) { rejectTarget.value = summary; rejectDialogVisible.value = true }

const commentDialogVisible = ref(false)
const commentTarget = ref<Summary | null>(null)
function openComment(summary: Summary) { commentTarget.value = summary; commentDialogVisible.value = true }

const logDrawerVisible = ref(false)
const logTargetId = ref<number | null>(null)
function openLog(summary: Summary) { logTargetId.value = summary.id; logDrawerVisible.value = true }

function onKanbanAction({ action, summary }: { action: string; summary: Summary }) {
  if (action === 'sign') {
    const stage = ({
      DRAFT: 'supervisor',
      SUPERVISOR_SIGNED: 'accounting',
      ACCOUNTING_SIGNED: 'finalize',
    } as Record<string, string>)[summary.status ?? '']
    if (stage) sign({ summary: { id: summary.id }, stage })
  } else if (action === 'reject') openReject(summary)
  else if (action === 'comment') openComment(summary)
  else if (action === 'log') openLog(summary)
}

function onKanbanActionPayload(payload: unknown) {
  onKanbanAction(payload as { action: string; summary: Summary })
}

defineExpose({
  view,
  selectedIds,
  openReject,
  openComment,
  openLog,
  openDetail,
  sign,
  signingIds,
  isSigning,
  summaries,
})

onMounted(() => {
  load()
  loadSignCounts()
})
</script>

<template>
  <div class="cycle-detail">
    <div v-if="cycle" class="meta">
      <strong>{{ cycle.academic_year }} 學年</strong>
      {{ cycle.semester === 'FIRST' ? '上學期' : '下學期' }} ｜
      基準日 {{ cycle.base_score_calc_date }} ｜
      基礎分數 {{ Number(cycle.base_score).toFixed(2) }} ｜
      狀態 {{ statusLabel(cycle.status ?? '') }}
    </div>

    <SignProgressBar :counts="signCounts" class="sign-progress-wrap" />

    <div class="toolbar">
      <el-button
        v-if="canRecompute"
        type="primary"
        :icon="Refresh"
        :loading="busy"
        data-test="recompute-btn"
        @click="recompute"
      >{{ MSG.recompute_btn }}</el-button>
      <el-button :icon="Download" tag="a" :href="exportAppraisalCycleXlsxUrl(cycleId)">匯出考核表</el-button>
      <el-button :icon="Download" tag="a" :href="exportAppraisalTransferRosterXlsxUrl(cycleId)">轉帳名冊</el-button>

      <span
        v-if="canBatchSign"
        class="batch-zone"
        data-test="batch-zone"
      >
        <el-tooltip content="勾選列後可批次簽核" :disabled="selectedIds.length > 0">
          <BatchSignButton
            v-if="canSignSupervisor"
            :cycle-id="cycleId" stage="SUPERVISOR" :selected-ids="selectedIds"
            :disabled="!selectedIds.length"
            :summaries-map="summariesById" @done="reload"
          />
        </el-tooltip>
        <el-tooltip content="勾選列後可批次簽核" :disabled="selectedIds.length > 0">
          <BatchSignButton
            v-if="canSignAccounting"
            :cycle-id="cycleId" stage="ACCOUNTING" :selected-ids="selectedIds"
            :disabled="!selectedIds.length"
            :summaries-map="summariesById" @done="reload"
          />
        </el-tooltip>
        <el-tooltip content="勾選列後可批次簽核" :disabled="selectedIds.length > 0">
          <BatchSignButton
            v-if="canFinalize"
            :cycle-id="cycleId" stage="FINALIZE" :selected-ids="selectedIds"
            :disabled="!selectedIds.length"
            :summaries-map="summariesById" @done="reload"
          />
        </el-tooltip>
      </span>

      <el-radio-group v-model="view" data-test="view-toggle" style="margin-left: auto;">
        <el-radio-button value="kanban">看板</el-radio-button>
        <el-radio-button value="list">列表</el-radio-button>
      </el-radio-group>
    </div>

    <KanbanView
      v-if="view === 'kanban'"
      ref="kanbanRef"
      :cycle-id="cycleId"
      @action="onKanbanActionPayload"
      @selected-changed="(ids) => (selectedIds = ids)"
    />

    <ListView
      v-else
      :cycle-id="cycleId"
      :participants="participants"
      :summary-by-participant="summaryByParticipant"
      :catalog="catalog"
      v-model:selected-ids="selectedIds"
      :busy="busy"
      :signing-ids="signingIds"
      :can-sign-supervisor="canSignSupervisor"
      :can-sign-accounting="canSignAccounting"
      :can-finalize="canFinalize"
      :can-reject="canReject"
      @sign="sign"
      @reject="openReject"
      @comment="openComment"
      @open-log="openLog"
      @open-detail="(p) => openDetail(p.employee_id)"
    />

    <RejectDialog
      v-model:visible="rejectDialogVisible"
      :summary="rejectTarget"
      @rejected="onRejected"
    />
    <CommentDialog
      v-model:visible="commentDialogVisible"
      :summary="commentTarget"
      @commented="onCommented"
    />
    <SummaryLogDrawer
      v-model:visible="logDrawerVisible"
      :summary-id="logTargetId"
    />
    <AggregatedStatusDetailDialog
      v-model:visible="detailDialogVisible"
      :participant="detailTarget"
      :cycle="cycle"
      :rules="rulesByCode"
    />
  </div>
</template>

<style scoped>
.cycle-detail { padding: 0; }
.meta { margin: var(--space-3) 0; padding: var(--space-3); background: var(--el-fill-color-light, #f5f7fa); border-radius: 4px; }
.sign-progress-wrap { margin: 0 0 var(--space-3); }
.toolbar { margin: var(--space-4) 0; display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.batch-zone { display: flex; gap: 6px; }
</style>
