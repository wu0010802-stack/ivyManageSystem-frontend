<script setup>
import { ref, computed, onMounted } from 'vue'
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
} from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'

import KanbanView from './components/KanbanView.vue'
import ListView from './components/ListView.vue'
import RejectDialog from './components/RejectDialog.vue'
import CommentDialog from './components/CommentDialog.vue'
import BatchSignButton from './components/BatchSignButton.vue'
import SummaryLogDrawer from './components/SummaryLogDrawer.vue'

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const cycle = ref(null)
const participants = ref([])
const summaries = ref([])
const catalog = ref([])
const loading = ref(false)
const busy = ref(false)

const view = ref('kanban')
const selectedIds = ref([])

const summaryByParticipant = computed(() => {
  const m = {}
  for (const s of summaries.value) m[s.participant_id] = s
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

const statusLabel = (s) =>
  ({ DRAFT: '草稿', SUPERVISOR_SIGNED: '主管已簽',
     ACCOUNTING_SIGNED: '會計已簽', FINALIZED: '已核定' }[s] || s)

async function load() {
  loading.value = true
  try {
    const cycles = (await listAppraisalCycles()).data
    cycle.value = cycles.find((c) => c.id === cycleId) || null
    participants.value = (await listAppraisalParticipants(cycleId)).data
    summaries.value = (await listAppraisalSummaries(cycleId)).data
    catalog.value = (await listAppraisalCatalog()).data
  } catch (e) {
    ElMessage.error(apiError(e, '載入失敗'))
  } finally {
    loading.value = false
  }
}

const kanbanRef = ref(null)
async function reload() {
  await load()
  if (kanbanRef.value?.reload) kanbanRef.value.reload()
}

async function recompute() {
  busy.value = true
  try {
    await recomputeAppraisalSummaries(cycleId)
    ElMessage.success('重算完成')
    await reload()
  } catch (e) {
    ElMessage.error(apiError(e, '重算失敗'))
  } finally {
    busy.value = false
  }
}

async function sign({ summary, stage }) {
  busy.value = true
  try {
    if (stage === 'supervisor') await signSupervisorAppraisalSummary(summary.id)
    else if (stage === 'accounting') await signAccountingAppraisalSummary(summary.id)
    else if (stage === 'finalize') await finalizeAppraisalSummary(summary.id)
    ElMessage.success('簽核完成')
    await reload()
  } catch (e) {
    ElMessage.error(apiError(e, '簽核失敗'))
  } finally {
    busy.value = false
  }
}

const rejectDialogVisible = ref(false)
const rejectTarget = ref(null)
function openReject(summary) { rejectTarget.value = summary; rejectDialogVisible.value = true }

const commentDialogVisible = ref(false)
const commentTarget = ref(null)
function openComment(summary) { commentTarget.value = summary; commentDialogVisible.value = true }

const logDrawerVisible = ref(false)
const logTargetId = ref(null)
function openLog(summary) { logTargetId.value = summary.id; logDrawerVisible.value = true }

function onKanbanAction({ action, summary }) {
  if (action === 'sign') {
    const stage = ({
      DRAFT: 'supervisor',
      SUPERVISOR_SIGNED: 'accounting',
      ACCOUNTING_SIGNED: 'finalize',
    })[summary.status]
    if (stage) sign({ summary: { id: summary.id }, stage })
  } else if (action === 'reject') openReject(summary)
  else if (action === 'comment') openComment(summary)
  else if (action === 'log') openLog(summary)
}

defineExpose({
  view,
  selectedIds,
  openReject,
  openComment,
  openLog,
})

onMounted(load)
</script>

<template>
  <div class="cycle-detail">
    <el-page-header content="半年考核明細" @back="router.back()" />
    <div v-if="cycle" class="meta">
      <strong>{{ cycle.academic_year }} 學年</strong>
      {{ cycle.semester === 'FIRST' ? '上學期' : '下學期' }} ｜
      基準日 {{ cycle.base_score_calc_date }} ｜
      基礎分數 {{ Number(cycle.base_score).toFixed(2) }} ｜
      狀態 {{ statusLabel(cycle.status) }}
    </div>

    <div class="toolbar">
      <el-button
        v-if="canRecompute"
        type="primary"
        :icon="Refresh"
        :loading="busy"
        data-test="recompute-btn"
        @click="recompute"
      >重算 Summary</el-button>
      <el-button :icon="Download" tag="a" :href="exportAppraisalCycleXlsxUrl(cycleId)">匯出考核表</el-button>
      <el-button :icon="Download" tag="a" :href="exportAppraisalTransferRosterXlsxUrl(cycleId)">轉帳名冊</el-button>

      <span
        v-if="selectedIds.length > 0 && canBatchSign"
        class="batch-zone"
        data-test="batch-zone"
      >
        <BatchSignButton
          v-if="canSignSupervisor"
          :cycle-id="cycleId" stage="SUPERVISOR" :selected-ids="selectedIds" @done="reload"
        />
        <BatchSignButton
          v-if="canSignAccounting"
          :cycle-id="cycleId" stage="ACCOUNTING" :selected-ids="selectedIds" @done="reload"
        />
        <BatchSignButton
          v-if="canFinalize"
          :cycle-id="cycleId" stage="FINALIZE" :selected-ids="selectedIds" @done="reload"
        />
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
      @action="onKanbanAction"
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
      :can-sign-supervisor="canSignSupervisor"
      :can-sign-accounting="canSignAccounting"
      :can-finalize="canFinalize"
      :can-reject="canReject"
      @sign="sign"
      @reject="openReject"
      @comment="openComment"
      @open-log="openLog"
    />

    <RejectDialog
      v-model:visible="rejectDialogVisible"
      :summary="rejectTarget"
      @rejected="reload"
    />
    <CommentDialog
      v-model:visible="commentDialogVisible"
      :summary="commentTarget"
      @commented="reload"
    />
    <SummaryLogDrawer
      v-model:visible="logDrawerVisible"
      :summary-id="logTargetId"
    />
  </div>
</template>

<style scoped>
.cycle-detail { padding: 16px; }
.meta { margin: 12px 0; padding: 12px; background: #f5f7fa; border-radius: 4px; }
.toolbar { margin: 16px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.batch-zone { display: flex; gap: 6px; }
</style>
