<template>
  <div>
    <!-- 摘要列 -->
    <el-card shadow="never" class="no-hover review-toolbar">
      <div class="review-toolbar__body">
        <span>
          需注意 <b class="text-warning">{{ settlement.anomalies.value.size }}</b> 筆 ／
          共 {{ settlement.records.value.length }} 人
          <span
            v-if="settlement.prevLoadFailed.value"
            class="review-toolbar__note text-warning"
          >
            （上月資料載入失敗，差異比較暫停——請重新整理，勿在無比較下定案）
          </span>
          <span
            v-else-if="settlement.prevRecords.value.length === 0"
            class="review-toolbar__note"
          >
            （上月無紀錄，差異比較停用）
          </span>
        </span>
        <div class="review-toolbar__actions">
          <el-input
            v-model="reviewSearch"
            placeholder="搜尋姓名/編號"
            :prefix-icon="Search"
            clearable
            size="small"
            style="width: 180px"
          />
          <el-switch v-model="onlyAttention" active-text="只看需注意" />
          <el-popover placement="bottom-end" :width="280" trigger="click">
            <template #reference>
              <el-button size="small">異常門檻</el-button>
            </template>
            <el-form label-width="110px" size="small">
              <el-form-item label="差異百分比 ≥">
                <el-input-number v-model="thresholdPctInput" :min="1" :max="100" :step="1" />
                <span class="threshold-unit">%</span>
              </el-form-item>
              <el-form-item label="差異金額 ≥">
                <el-input-number v-model="thresholdAbsInput" :min="0" :step="500" />
                <span class="threshold-unit">元</span>
              </el-form-item>
              <el-button size="small" type="primary" @click="applyThresholds">套用（僅本機）</el-button>
            </el-form>
          </el-popover>
          <el-button
            v-if="canWriteSalary"
            type="primary"
            size="small"
            :disabled="selectedAdjustRows.length === 0"
            @click="batchAdjustVisible = true"
          >批次調整 ({{ selectedAdjustRows.length }})</el-button>
        </div>
      </div>
    </el-card>

    <el-table
      v-if="settlement.records.value.length > 0"
      :data="visibleRecords"
      border
      stripe
      max-height="600"
      style="width: 100%"
      v-loading="settlement.loading.value"
      :row-class-name="rowClassName"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" :selectable="isRowSelectable" width="45" />
      <el-table-column type="expand">
        <template #default="{ row }">
          <SalaryBreakdown :row="row" :year="q.year" :month="q.month" />
        </template>
      </el-table-column>
      <el-table-column prop="employee_name" label="姓名" width="100" fixed />
      <el-table-column label="注意" width="170">
        <template #default="scope">
          <el-tag v-if="scope.row.is_finalized" size="small" type="success" class="attn-tag">已封存</el-tag>
          <el-tag
            v-for="r in reasonsFor(scope.row)"
            :key="reasonKey(r)"
            size="small"
            type="warning"
            class="attn-tag"
          >
            {{ reasonLabel(r) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="底薪" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'base_salary')">
            {{ money(scope.row.base_salary) }}
          </button>
        </template>
      </el-table-column>
      <el-table-column width="120" align="right" class-name="num-cell">
        <template #header>
          <el-tooltip content="2月發(12-1月)、6月發(2-5月)、9月發(6-8月)、12月發(9-11月)" placement="top">
            <span>節慶獎金 <el-icon :size="12"><InfoFilled /></el-icon></span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'festival_bonus')">
            {{ money(scope.row.festival_bonus) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="festival_bonus" />
        </template>
      </el-table-column>
      <el-table-column label="超額獎金" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'overtime_bonus')">
            {{ money(scope.row.overtime_bonus) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="overtime_bonus" />
        </template>
      </el-table-column>
      <!-- 考核年終欄已移除：決策⑥B 後走年終 E化獨立轉帳（表外），
           engine 恆填 0 且該欄不在 records response schema -->
      <el-table-column label="加班津貼" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'overtime_pay')">
            {{ money(scope.row.overtime_pay) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="overtime_pay" />
        </template>
      </el-table-column>
      <el-table-column label="主管紅利" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'supervisor_dividend')">
            {{ money(scope.row.supervisor_dividend) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="supervisor_dividend" />
        </template>
      </el-table-column>
      <el-table-column label="園務會議" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'meeting_overtime_pay')">
            {{ money(scope.row.meeting_overtime_pay) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="meeting_overtime_pay" />
        </template>
      </el-table-column>
      <el-table-column label="生日禮金" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'birthday_bonus')">
            {{ money(scope.row.birthday_bonus) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="birthday_bonus" />
        </template>
      </el-table-column>
      <el-table-column label="勞保" width="90" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'labor_insurance')">
            {{ money(scope.row.labor_insurance) }}
          </button>
        </template>
      </el-table-column>
      <el-table-column label="健保" width="90" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'health_insurance')">
            {{ money(scope.row.health_insurance) }}
          </button>
        </template>
      </el-table-column>
      <el-table-column label="勞退自提" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <span class="text-danger">{{ money(scope.row.pension_self) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="請假扣款" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'leave_deduction')">
            {{ money(scope.row.leave_deduction) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="leave_deduction" />
        </template>
      </el-table-column>
      <el-table-column label="遲到扣款" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'late_deduction')">
            {{ money(scope.row.late_deduction) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="late_deduction" />
        </template>
      </el-table-column>
      <el-table-column label="早退扣款" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'early_leave_deduction')">
            {{ money(scope.row.early_leave_deduction) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="early_leave_deduction" />
        </template>
      </el-table-column>
      <el-table-column width="128" align="right" class-name="num-cell">
        <template #header>
          <el-tooltip content="僅從節慶獎金扣減，不計入總扣款與實領月薪" placement="top">
            <span>節慶獎金扣減 <el-icon :size="12"><InfoFilled /></el-icon></span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <button type="button" class="cell-link text-link-warning" @click="openFieldBreakdown(scope.row, 'meeting_absence_deduction')">
            {{ money(scope.row.meeting_absence_deduction) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="meeting_absence_deduction" />
        </template>
      </el-table-column>
      <el-table-column label="曠職扣款" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'absence_deduction')">
            {{ money(scope.row.absence_deduction) }}
          </button>
          <ManualOverrideIcon :row="scope.row" field="absence_deduction" />
        </template>
      </el-table-column>
      <el-table-column label="總扣款" width="100" align="right" class-name="num-cell">
        <template #default="scope">
          <span class="text-danger">{{ money(scope.row.total_deductions) }}</span>
        </template>
      </el-table-column>
      <el-table-column width="120" align="right" class-name="num-cell">
        <template #header>
          <el-tooltip content="補休到期、特休週年、離職結算產生的未休假折現加給，已計入實領" placement="top">
            <span>未休折現 <el-icon :size="12"><InfoFilled /></el-icon></span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <UnusedLeavePayoutTooltip
            v-if="(scope.row.unused_leave_payout as number) > 0 && scope.row.id"
            :salary-record-id="scope.row.id"
            :amount="scope.row.unused_leave_payout as number"
          />
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="實領" width="120" align="right" class-name="num-cell">
        <template #default="scope">
          <strong>{{ money(computeBaseTransferAmount(scope.row)) }}</strong>
        </template>
      </el-table-column>
      <el-table-column width="130" align="right" class-name="num-cell">
        <template #header>
          <el-tooltip content="實領 + 節慶獎金 + 超額獎金（獎金為獨立轉帳）" placement="top">
            <span>含獎金實領 <el-icon :size="12"><InfoFilled /></el-icon></span>
          </el-tooltip>
        </template>
        <template #default="scope">
          <strong class="text-success-strong">
            {{ money(computeTotalTakeHomeAmount(scope.row)) }}
          </strong>
        </template>
      </el-table-column>
      <el-table-column label="編輯紀錄" min-width="220">
        <template #default="scope">
          <span class="remark-text">{{ scope.row.remark || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="scope">
          <el-tooltip :content="scope.row.is_finalized ? '已封存，不可調整' : ''" :disabled="!scope.row.is_finalized" placement="top">
            <span>
              <el-button
                v-if="canWriteSalary"
                type="primary"
                size="small"
                link
                :disabled="scope.row.is_finalized"
                @click="openAdjust(scope.row)"
              >
                調整
              </el-button>
            </span>
          </el-tooltip>
          <el-button type="primary" size="small" link @click="exportPdf(scope.row)">PDF</el-button>
        </template>
      </el-table-column>
    </el-table>

    <EmptyState
      v-else-if="!settlement.loading.value"
      title="本月尚未計算薪資"
      description="請先回到「計算」步驟執行計算"
    />

    <div class="step-actions">
      <el-button type="primary" :disabled="settlement.records.value.length === 0" @click="$emit('next')">
        確認無誤，進入定案 →
      </el-button>
    </div>

    <!-- 列內調整側滑 -->
    <AdjustDrawer v-model="adjustVisible" :row="adjustingRow" @saved="settlement.refresh()" />

    <!-- 批次調整 dialog -->
    <BatchAdjustDialog v-model="batchAdjustVisible" :count="selectedAdjustRows.length" @confirm="applyBatchAdjust" />

    <!-- 欄位明細 dialog（自原 SalaryView 搬移） -->
    <el-dialog v-model="showFieldBreakdownDialog" :title="fieldBreakdownTitle" width="960px">
      <div v-loading="fieldBreakdownLoading">
        <template v-if="fieldBreakdown">
          <el-descriptions :column="2" border class="breakdown-meta">
            <el-descriptions-item label="姓名">{{ fieldBreakdown.employee?.employee_name }}</el-descriptions-item>
            <el-descriptions-item label="員工編號">{{ fieldBreakdown.employee?.employee_code }}</el-descriptions-item>
            <el-descriptions-item label="職稱">{{ fieldBreakdown.employee?.job_title || '-' }}</el-descriptions-item>
            <el-descriptions-item label="月份">{{ fieldBreakdown.employee?.year }} 年 {{ fieldBreakdown.employee?.month }} 月</el-descriptions-item>
          </el-descriptions>
          <el-table :data="fieldBreakdown.rows" border max-height="480" stripe class="field-breakdown-table">
            <el-table-column
              v-for="column in fieldBreakdown.columns"
              :key="column.key"
              :prop="column.key"
              :label="column.label"
              min-width="120"
            >
              <template #default="scope">
                {{ renderFieldBreakdownValue(scope.row, column) }}
              </template>
            </el-table-column>
          </el-table>
          <el-alert v-if="fieldBreakdown.note" :title="fieldBreakdown.note" type="info" :closable="false" class="breakdown-alert" />
        </template>
      </div>
      <template #footer>
        <div class="breakdown-footer" v-if="fieldBreakdown">
          明細合計：<strong>{{ money(fieldBreakdown.summary?.amount || 0) }}</strong>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, h, defineComponent, type PropType } from 'vue'
import { ElMessage, ElTooltip, ElIcon } from 'element-plus'
import { InfoFilled, Edit, Search } from '@element-plus/icons-vue'
import { getSalaryFieldBreakdown, manualAdjustSalary } from '@/api/salary'
import SalaryBreakdown from '../SalaryBreakdown.vue'
import AdjustDrawer from './AdjustDrawer.vue'
import BatchAdjustDialog from './BatchAdjustDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import UnusedLeavePayoutTooltip from '@/components/salary/UnusedLeavePayoutTooltip.vue'
import { hasPermission } from '@/utils/auth'
import { money } from '@/utils/format'
import {
    computeBaseTransferAmount,
    computeTotalTakeHomeAmount,
} from '@/utils/salaryAmounts'
import { downloadFile } from '@/utils/download'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { useClientTableFilter } from '@/composables/useClientTableFilter'
import {
    getThresholds,
    setThresholds,
    type SalarySettlement,
    type SettlementRecord,
    type AnomalyReason,
} from '@/composables/useSalarySettlement'

defineEmits<{ (e: 'next'): void }>()

const settlement = inject<SalarySettlement>('settlement')!
const q = inject<{ year: number; month: number }>('settleQuery', {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
})
const { notify } = useErrorNotify()
const canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))

// ---- 人工調整標記（共用小元件，取代原頁 16 處重複 tooltip） ----
const ManualOverrideIcon = defineComponent({
    props: {
        row: { type: Object as PropType<SettlementRecord>, required: true },
        field: { type: String, required: true },
    },
    setup(props) {
        return () => {
            const overrides = props.row?.manual_overrides
            if (!Array.isArray(overrides) || !overrides.includes(props.field)) return null
            return h(
                ElTooltip,
                { content: '此欄位已人工調整，重算時將保留此值', placement: 'top' },
                { default: () => h(ElIcon, { class: 'manual-override-icon', size: 11 }, { default: () => h(Edit) }) },
            )
        }
    },
})

// ---- 異常浮出 ----
const onlyAttention = ref(false)
const attentionRecords = computed(() => {
    const sorted = settlement.sortedRecords.value
    if (!onlyAttention.value) return sorted
    return sorted.filter((r) => settlement.anomalies.value.has(r.employee_id))
})
const { searchQuery: reviewSearch, filtered: visibleRecords } = useClientTableFilter<SettlementRecord>({
    source: () => attentionRecords.value,
    searchFields: (r) => [r.employee_name, String(r.employee_id)],
})
const reasonsFor = (row: SettlementRecord): AnomalyReason[] =>
    settlement.anomalies.value.get(row.employee_id) ?? []
const FIELD_LABELS: Record<string, string> = { net_salary: '實領', gross_salary: '應發' }
// v-for 穩定 key：同一列的 reasons 內 type（diff 加 field）唯一
const reasonKey = (r: AnomalyReason): string => (r.type === 'diff' ? `diff-${r.field}` : r.type)
const reasonLabel = (r: AnomalyReason): string => {
    if (r.type === 'manual') return '手動調整過'
    if (r.type === 'new') return '本月新進'
    const sign = '±'
    return `${FIELD_LABELS[r.field] ?? r.field}與上月差 ${sign}${Math.round(r.pct * 100)}%`
}
const rowClassName = ({ row }: { row: SettlementRecord }) =>
    settlement.anomalies.value.has(row.employee_id) ? 'attention-row' : ''

// ---- 異常門檻（per 裝置，localStorage） ----
const thresholdPctInput = ref(Math.round(getThresholds().pct * 100))
const thresholdAbsInput = ref(getThresholds().abs)
const applyThresholds = () => {
    const t = { pct: thresholdPctInput.value / 100, abs: thresholdAbsInput.value }
    setThresholds(t)
    settlement.thresholds.value = t
    ElMessage.success('異常門檻已更新（僅本機生效）')
}

// ---- 列內調整 ----
const adjustVisible = ref(false)
const adjustingRow = ref<SettlementRecord | null>(null)
const openAdjust = (row: SettlementRecord) => {
    adjustingRow.value = row
    adjustVisible.value = true
}

// ---- 批次調整 ----
const batchAdjustVisible = ref(false)
const selectedAdjustRows = ref<SettlementRecord[]>([])
const isRowSelectable = (row: SettlementRecord) => !row.is_finalized
const onSelectionChange = (rows: SettlementRecord[]) => {
    selectedAdjustRows.value = rows
}
const applyBatchAdjust = async ({ field, value, reason }: { field: string; value: number; reason: string }) => {
    const rows = selectedAdjustRows.value
    if (rows.length === 0) return
    const payload = { [field]: value, adjustment_reason: reason } as Parameters<typeof manualAdjustSalary>[1]
    const results = await Promise.allSettled(
        rows.map((r) => manualAdjustSalary(r.id, payload, r.version ?? undefined)),
    )
    const failed = results
        .map((res, i) => ({ res, row: rows[i] }))
        .filter((x) => x.res.status === 'rejected')
        .map((x) => {
            const e = (x.res as PromiseRejectedResult).reason as { response?: { data?: { detail?: string } } }
            return { name: x.row.employee_name, reason: e?.response?.data?.detail || '失敗' }
        })
    const succeeded = rows.length - failed.length
    if (failed.length === 0) {
        ElMessage.success(`已套用 ${succeeded} 筆`)
    } else {
        ElMessage.warning(
            `完成：成功 ${succeeded} 筆，失敗 ${failed.length} 筆（${failed.map((f) => `${f.name}: ${f.reason}`).join('；')}）`,
        )
    }
    batchAdjustVisible.value = false
    selectedAdjustRows.value = []
    settlement.refresh()
}

// ---- 單人 PDF ----
const exportPdf = (row: SettlementRecord) => {
    if (!row.id) {
        ElMessage.warning('請先計算薪資後再匯出')
        return
    }
    downloadFile(`/salaries/${row.id}/export?format=pdf`, `薪資單_${row.employee_name}.pdf`)
}

// ---- 欄位明細 dialog（自原 SalaryView 搬移） ----
interface FieldBreakdown {
    employee?: { employee_name?: string; employee_code?: string; job_title?: string; year?: number; month?: number }
    title?: string
    rows?: Record<string, unknown>[]
    columns?: { key: string; label?: string; [key: string]: unknown }[]
    note?: string
    summary?: Record<string, unknown>
}
const showFieldBreakdownDialog = ref(false)
const fieldBreakdownLoading = ref(false)
const fieldBreakdown = ref<FieldBreakdown | null>(null)
const MONEY_KEYS = new Set(['bonusBase', 'result', 'perPerson', 'pay', 'deduction', 'dailySalary', 'ruleAmount', 'penalty'])

const openFieldBreakdown = async (row: SettlementRecord, field: string) => {
    if (!row.id) {
        ElMessage.warning('請先計算薪資後再查看明細')
        return
    }
    fieldBreakdownLoading.value = true
    try {
        const response = await getSalaryFieldBreakdown(row.id, field)
        fieldBreakdown.value = response.data as FieldBreakdown
        showFieldBreakdownDialog.value = true
    } catch (error) {
        notify(error, 'StepReview.fieldBreakdown', null, { prefix: '載入欄位明細失敗' })
    } finally {
        fieldBreakdownLoading.value = false
    }
}
const fieldBreakdownTitle = computed(() => {
    const employee = fieldBreakdown.value?.employee
    if (!employee || !fieldBreakdown.value?.title) return '薪資明細'
    return `${fieldBreakdown.value.title}｜${employee.employee_name}｜${employee.year} 年 ${employee.month} 月`
})
const renderFieldBreakdownValue = (row: Record<string, unknown>, column: { key: string }) => {
    const value = row?.[column.key]
    if (value === null || value === undefined || value === '') return '-'
    if (MONEY_KEYS.has(column.key)) return money(value)
    if (column.key === 'value' && typeof value === 'number') return money(value)
    return value
}

</script>

<style scoped>
.review-toolbar {
  margin-bottom: var(--space-4);
}

.review-toolbar__body {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.review-toolbar__note {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.review-toolbar__actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.threshold-unit {
  margin-left: var(--space-2);
  color: var(--text-secondary);
}

.attn-tag {
  margin: 0 4px 2px 0;
}

:deep(.attention-row > td) {
  background-color: var(--color-warning-soft) !important;
}
/* 注意列的彩色左條已移除（design system 禁區 pattern）：
   整列 warning-soft 底色 + 「注意」欄 tag 已足以標示狀態。 */

.step-actions {
  margin-top: var(--space-6);
  text-align: right;
}

.cell-link {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.text-link-primary {
  color: var(--el-color-primary);
}

.text-link-danger {
  color: var(--el-color-danger);
  font-weight: 600;
}

.text-link-warning {
  color: var(--el-color-warning);
  font-weight: 600;
}

.text-warning {
  color: var(--el-color-warning);
}

.text-success-strong {
  color: var(--el-color-success);
}

.remark-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.breakdown-meta,
.breakdown-alert,
.field-breakdown-table {
  margin-bottom: 16px;
}

.breakdown-footer {
  font-size: var(--text-lg);
  text-align: right;
}

:deep(.manual-override-icon) {
  margin-left: 4px;
  color: var(--el-color-warning);
  vertical-align: middle;
}
</style>
