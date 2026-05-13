<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, RefreshRight, Check, Close, View } from '@element-plus/icons-vue'
import {
  listAppraisalSummaries,
  recomputeCycleSummaries,
  signSupervisor,
  signAccounting,
  finalizeSummary,
  rejectSummary,
} from '@/api/appraisal'
import { useEmployeeStore } from '@/stores/employee'
import { apiError } from '@/utils/error'

const props = defineProps({
  cycle: { type: Object, required: true },
  participants: { type: Array, required: true },
})

const employeeStore = useEmployeeStore()
const employeeName = (id) =>
  (employeeStore.employees || []).find((e) => e.id === id)?.name || `員工#${id}`

const summaries = ref([])
const loading = ref(false)
const recomputing = ref(false)
const statusFilter = ref('')

const statusOptions = [
  { value: '', label: '全部' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'SUPERVISOR_SIGNED', label: '主管已簽' },
  { value: 'ACCOUNTING_SIGNED', label: '會計已核' },
  { value: 'FINALIZED', label: '已核定' },
]

const statusMeta = {
  DRAFT: { label: '草稿', type: 'info' },
  SUPERVISOR_SIGNED: { label: '主管已簽', type: '' },
  ACCOUNTING_SIGNED: { label: '會計已核', type: 'warning' },
  FINALIZED: { label: '已核定', type: 'success' },
}

const gradeMeta = {
  OUTSTANDING: { label: '優', type: 'success' },
  GOOD: { label: '甲', type: 'success' },
  PASS: { label: '乙', type: '' },
  WARN: { label: '丙', type: 'warning' },
  FAIL: { label: '丁', type: 'danger' },
}

const participantNameById = (participantId) => {
  const p = props.participants.find((x) => x.id === participantId)
  return p ? employeeName(p.employee_id) : `參與者#${participantId}`
}

const sortedSummaries = computed(() =>
  [...summaries.value].sort(
    (a, b) =>
      participantNameById(a.participant_id).localeCompare(
        participantNameById(b.participant_id),
        'zh-Hant',
      ),
  ),
)

const fetchSummaries = async () => {
  loading.value = true
  try {
    const params = { cycle_id: props.cycle.id }
    if (statusFilter.value) params.status = statusFilter.value
    const res = await listAppraisalSummaries(params)
    summaries.value = res.data || []
  } catch (error) {
    ElMessage.error(apiError(error, '載入 summary 失敗'))
  } finally {
    loading.value = false
  }
}

const doRecompute = async () => {
  try {
    await ElMessageBox.confirm(
      '將為此週期所有參與者重算 summary（已核定者跳過）。確定？',
      '重算 summary',
      { type: 'info', confirmButtonText: '重算', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  recomputing.value = true
  try {
    const res = await recomputeCycleSummaries(props.cycle.id)
    summaries.value = res.data || []
    ElMessage.success(`已重算，共 ${summaries.value.length} 筆`)
  } catch (error) {
    ElMessage.error(apiError(error, '重算失敗'))
  } finally {
    recomputing.value = false
  }
}

// ── Sign / Finalize / Reject 共用對話框 ──
// mode: 'supervisor' | 'accounting' | 'finalize' | 'reject'
const dialogVisible = ref(false)
const submitting = ref(false)
const dialogMode = ref('supervisor')
const dialogTarget = ref(null)
const dialogForm = reactive({ comment: '', reason: '' })

const dialogMeta = computed(() => {
  switch (dialogMode.value) {
    case 'supervisor':
      return {
        title: '主管簽核（第一階）',
        confirmText: '簽核',
        showComment: true,
        showReason: false,
      }
    case 'accounting':
      return {
        title: '會計核數（第二階）',
        confirmText: '核數',
        showComment: true,
        showReason: false,
      }
    case 'finalize':
      return {
        title: '最終核定（第三階）',
        confirmText: '核定',
        showComment: true,
        showReason: true,
        reasonHint: '雙簽 reason ≥ 4 字，將寫入稽核軌跡',
      }
    case 'reject':
      return {
        title: '退回',
        confirmText: '退回',
        showComment: false,
        showReason: true,
        reasonHint: '退回會清除已完成的簽章戳記，請說明原因（≥ 4 字）',
      }
    default:
      return { title: '', confirmText: '確認', showComment: false, showReason: false }
  }
})

const openDialog = (mode, row) => {
  dialogMode.value = mode
  dialogTarget.value = row
  dialogForm.comment = ''
  dialogForm.reason = ''
  dialogVisible.value = true
}

const mapSummaryError = (error, fallback) => {
  const detail = error.response?.data?.detail || ''
  if (detail.startsWith('stage_invalid')) {
    if (detail.includes('finalized_must_unlock_cycle'))
      return '已核定的 summary 須先解鎖 cycle 才能退回'
    if (detail.includes('already_draft')) return '此 summary 已是草稿'
    return '當前階段不允許此操作（可能已被他人變更）'
  }
  if (detail.startsWith('missing_permission')) return '您沒有此操作的權限'
  if (detail === 'summary_not_found') return 'summary 不存在'
  return apiError(error, fallback)
}

const submitDialog = async () => {
  const meta = dialogMeta.value
  if (meta.showReason) {
    if (!dialogForm.reason || dialogForm.reason.trim().length < 4) {
      ElMessage.warning('reason 至少需 4 個字')
      return
    }
  }
  if (meta.showComment && dialogForm.comment.length > 500) {
    ElMessage.warning('comment 不可超過 500 字')
    return
  }

  submitting.value = true
  const id = dialogTarget.value.id
  try {
    if (dialogMode.value === 'supervisor') {
      await signSupervisor(id, dialogForm.comment.trim())
    } else if (dialogMode.value === 'accounting') {
      await signAccounting(id, dialogForm.comment.trim())
    } else if (dialogMode.value === 'finalize') {
      await finalizeSummary(id, {
        comment: dialogForm.comment.trim(),
        reason: dialogForm.reason.trim(),
      })
    } else if (dialogMode.value === 'reject') {
      await rejectSummary(id, dialogForm.reason.trim())
    }
    ElMessage.success('已完成')
    dialogVisible.value = false
    fetchSummaries()
  } catch (error) {
    ElMessage.error(mapSummaryError(error, '操作失敗'))
  } finally {
    submitting.value = false
  }
}

// ── 歷程檢視 ──
const historyVisible = ref(false)
const historyTarget = ref(null)

const openHistory = (row) => {
  historyTarget.value = row
  historyVisible.value = true
}

const fmtDt = (dt) => (dt ? dt.slice(0, 19).replace('T', ' ') : '—')

onMounted(fetchSummaries)
</script>

<template>
  <section class="summaries-section">
    <div class="section-head">
      <div>
        <h3>簽核狀態</h3>
        <p class="hint">
          共 {{ summaries.length }} 筆
          ・三階流程：草稿 → 主管簽 → 會計核 → 最終核定
        </p>
      </div>
      <div class="actions">
        <el-select
          v-model="statusFilter"
          placeholder="篩選狀態"
          style="width: 130px"
          @change="fetchSummaries"
        >
          <el-option
            v-for="opt in statusOptions"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </el-select>
        <el-button :icon="Refresh" @click="fetchSummaries" :loading="loading">
          重新整理
        </el-button>
        <el-button
          type="primary"
          :icon="RefreshRight"
          :loading="recomputing"
          :disabled="participants.length === 0"
          @click="doRecompute"
        >重算 summary</el-button>
      </div>
    </div>

    <el-table
      :data="sortedSummaries"
      v-loading="loading"
      empty-text="尚無 summary，點擊「重算 summary」初始化"
      stripe
    >
      <el-table-column label="姓名" min-width="120">
        <template #default="{ row }">{{ participantNameById(row.participant_id) }}</template>
      </el-table-column>
      <el-table-column label="基數" prop="base_score" width="80" align="right" />
      <el-table-column label="事件分" prop="event_score_sum" width="90" align="right">
        <template #default="{ row }">
          <span :class="Number(row.event_score_sum) >= 0 ? 'score-pos' : 'score-neg'">
            {{ Number(row.event_score_sum) > 0 ? '+' : '' }}{{ row.event_score_sum }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="總分" prop="total_score" width="80" align="right">
        <template #default="{ row }">
          <strong>{{ row.total_score }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="等第" width="80" align="center">
        <template #default="{ row }">
          <el-tag
            :type="gradeMeta[row.grade]?.type || ''"
            disable-transitions
            size="small"
          >{{ gradeMeta[row.grade]?.label || row.grade }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="獎金" prop="bonus_amount" width="110" align="right">
        <template #default="{ row }">
          <strong class="bonus">${{ Number(row.bonus_amount).toLocaleString() }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="120">
        <template #default="{ row }">
          <el-tag
            :type="statusMeta[row.status]?.type || ''"
            disable-transitions
            size="small"
          >{{ statusMeta[row.status]?.label || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="動作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'DRAFT'"
            size="small"
            type="primary"
            :icon="Check"
            @click="openDialog('supervisor', row)"
          >主管簽</el-button>
          <el-button
            v-if="row.status === 'SUPERVISOR_SIGNED'"
            size="small"
            type="primary"
            :icon="Check"
            @click="openDialog('accounting', row)"
          >會計核</el-button>
          <el-button
            v-if="row.status === 'ACCOUNTING_SIGNED'"
            size="small"
            type="primary"
            :icon="Check"
            @click="openDialog('finalize', row)"
          >核定</el-button>
          <el-button
            v-if="['SUPERVISOR_SIGNED', 'ACCOUNTING_SIGNED'].includes(row.status)"
            size="small"
            :icon="Close"
            @click="openDialog('reject', row)"
          >退回</el-button>
          <el-button
            size="small"
            :icon="View"
            @click="openHistory(row)"
          >歷程</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Sign / Finalize / Reject 共用對話框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMeta.title"
      width="520px"
      :close-on-click-modal="false"
    >
      <p v-if="dialogTarget" class="dialog-target">
        對象：<strong>{{ participantNameById(dialogTarget.participant_id) }}</strong>
        ・總分 {{ dialogTarget.total_score }}
        ・等第 {{ gradeMeta[dialogTarget.grade]?.label || dialogTarget.grade }}
        ・獎金 ${{ Number(dialogTarget.bonus_amount).toLocaleString() }}
      </p>
      <el-form label-width="80px" @submit.prevent="submitDialog">
        <el-form-item v-if="dialogMeta.showComment" label="註記">
          <el-input
            v-model="dialogForm.comment"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="（可選）"
          />
        </el-form-item>
        <el-form-item v-if="dialogMeta.showReason" label="原因" required>
          <el-input
            v-model="dialogForm.reason"
            type="textarea"
            :rows="3"
            :placeholder="dialogMeta.reasonHint"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="submitDialog"
        >{{ dialogMeta.confirmText }}</el-button>
      </template>
    </el-dialog>

    <!-- 歷程檢視 -->
    <el-dialog
      v-model="historyVisible"
      title="簽核歷程"
      width="560px"
    >
      <div v-if="historyTarget" class="history">
        <div class="history-target">
          {{ participantNameById(historyTarget.participant_id) }}
          ・<el-tag
            :type="statusMeta[historyTarget.status]?.type || ''"
            disable-transitions
            size="small"
          >{{ statusMeta[historyTarget.status]?.label || historyTarget.status }}</el-tag>
        </div>
        <div class="history-stage">
          <h4>第一階：主管簽核</h4>
          <p v-if="historyTarget.supervisor_signed_at">
            <span class="ts">{{ fmtDt(historyTarget.supervisor_signed_at) }}</span>
            <span v-if="historyTarget.supervisor_comment" class="comment">
              {{ historyTarget.supervisor_comment }}
            </span>
          </p>
          <p v-else class="empty">尚未簽核</p>
        </div>
        <div class="history-stage">
          <h4>第二階：會計核數</h4>
          <p v-if="historyTarget.accounting_signed_at">
            <span class="ts">{{ fmtDt(historyTarget.accounting_signed_at) }}</span>
            <span v-if="historyTarget.accounting_comment" class="comment">
              {{ historyTarget.accounting_comment }}
            </span>
          </p>
          <p v-else class="empty">尚未核數</p>
        </div>
        <div class="history-stage">
          <h4>第三階：最終核定</h4>
          <p v-if="historyTarget.finalized_at">
            <span class="ts">{{ fmtDt(historyTarget.finalized_at) }}</span>
            <span v-if="historyTarget.finalized_comment" class="comment">
              {{ historyTarget.finalized_comment }}
            </span>
          </p>
          <p v-else class="empty">尚未核定</p>
        </div>
        <p class="version">版本：v{{ historyTarget.version }}</p>
      </div>
      <template #footer>
        <el-button @click="historyVisible = false">關閉</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.summaries-section {
  background: #fff;
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  border: 1px solid var(--neutral-200);
  margin-top: var(--space-5);
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-4);
  gap: var(--space-3);
}

.section-head h3 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xl);
  color: var(--text-primary);
}

.hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.score-pos {
  color: var(--color-success);
  font-weight: 600;
}

.score-neg {
  color: var(--color-danger);
  font-weight: 600;
}

.bonus {
  color: var(--color-primary);
}

.dialog-target {
  margin: 0 0 var(--space-4);
  padding: var(--space-3);
  background: var(--neutral-50);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.history-target {
  margin-bottom: var(--space-4);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.history-stage {
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  background: var(--neutral-50);
  border-radius: var(--radius-md);
}

.history-stage h4 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  font-weight: 600;
}

.history-stage p {
  margin: 0;
  color: var(--text-primary);
}

.history-stage .ts {
  font-family: var(--font-mono, monospace);
  color: var(--text-secondary);
  margin-right: var(--space-3);
}

.history-stage .comment {
  color: var(--text-primary);
}

.history-stage .empty {
  color: var(--text-tertiary);
  font-style: italic;
}

.version {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  text-align: right;
}
</style>
