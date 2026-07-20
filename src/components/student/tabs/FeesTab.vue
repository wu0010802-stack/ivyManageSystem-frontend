<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import {
  getFeeRecords,
  getFeeAdjustments,
  getFeePeriods,
  payFeeRecord,
} from '@/api/fees'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { todayISO } from '@/utils/format'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { FEE_TYPES, FEE_TYPE_LABELS, bucketByFeeType } from '@/components/fees/feeTypes'
import RefundSuggestModal from '@/components/fees/RefundSuggestModal.vue'
import AdjustmentEditDialog from '@/components/fees/AdjustmentEditDialog.vue'

const props = withDefaults(defineProps<{
  studentId: number
  studentName?: string
  active?: boolean
}>(), {
  studentName: '',
  active: true,
})

const canRead = computed(() => hasPermission('FEES_READ'))
const canWrite = computed(() => hasPermission('FEES_WRITE'))

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const RECORD_STATUS_LABEL: Record<string, string> = { paid: '已繳', partial: '部分', unpaid: '未繳' }
const RECORD_STATUS_TYPE: Record<string, ElTagType> = { paid: 'success', partial: 'warning', unpaid: 'info' }

const ALL_PERIODS = '__all__'

const loading = ref(false)
const loaded = ref(false)
const periodOptions = ref<string[]>([])
const period = ref(ALL_PERIODS)
const records = ref<Record<string, unknown>[]>([])
const adjustments = ref<Record<string, unknown>[]>([])

// ─── 預設期別：本學期（若 periodOptions 有），否則「全部」 ────────────────────
async function loadPeriods() {
  try {
    const data = await getFeePeriods()
    // /fees/periods 回的是純陣列 ['114-2', '114-1', ...]
    periodOptions.value = Array.isArray(data) ? data : (data?.items || [])
    if (period.value === ALL_PERIODS && periodOptions.value.length) {
      const term = getCurrentAcademicTerm()
      const current = `${term.school_year}-${term.semester}`
      if (periodOptions.value.includes(current)) period.value = current
    }
  } catch (_e) {
    // 期別清單可選用，失敗時保留「全部」
  }
}

let requestSeq = 0
async function fetchData() {
  if (!props.studentId || !canRead.value) return
  const seq = ++requestSeq
  const sid = props.studentId
  loading.value = true
  try {
    // page_size 上限對齊後端 api/fees/records.py 的 le=200（超過直接 422）
    const recParams: Record<string, unknown> = { student_id: sid, page_size: 200 }
    const adjParams: Record<string, unknown> = { student_id: sid }
    if (period.value && period.value !== ALL_PERIODS) {
      recParams.period = period.value
      adjParams.period = period.value
    }
    const [recRes, adjRes] = await Promise.all([
      getFeeRecords(recParams),
      getFeeAdjustments(adjParams).catch(() => ({ items: [] })),
    ])
    if (seq !== requestSeq || props.studentId !== sid) return
    records.value = (recRes?.items ?? []) as unknown as Record<string, unknown>[]
    adjustments.value = (adjRes?.items ?? []) as unknown as Record<string, unknown>[]
    loaded.value = true
  } catch (e) {
    if (seq !== requestSeq || props.studentId !== sid) return
    ElMessage.error(apiError(e, '載入學費紀錄失敗'))
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

// 先取 period 清單，loadPeriods 可能把 period 從 ALL_PERIODS 切到本學期，
// 之後 fetchData 才能用正確 period 發第一次請求（避免 race 出兩次請求）。
async function loadThenFetch() {
  await loadPeriods()
  fetchData()
}

// detail panel 切換學生時會重用同一分頁實例，須重置 loaded 並重載；requestSeq
// 防舊學生的慢回應覆寫新學生。
watch(
  () => props.studentId,
  () => {
    requestSeq += 1
    records.value = []
    adjustments.value = []
    loaded.value = false
    loading.value = false
    if (props.active) void loadThenFetch()
  },
)
watch(
  () => props.active,
  (active) => {
    if (active && !loaded.value && !loading.value) void loadThenFetch()
  },
  { immediate: true },
)

watch(period, () => {
  if (loaded.value) fetchData()
})

// ─── 樞紐：fee_type 分桶 ──────────────────────────────────────────────────────
const buckets = computed(() => bucketByFeeType(records.value, adjustments.value))

const recordRows = computed(() =>
  FEE_TYPES.filter((ft) => ft.source === 'record').map((ft) => {
    const recs = buckets.value.fees[ft.value] || []
    const due = recs.reduce((s, r) => s + ((r.amount_due as number) || 0), 0)
    const paid = recs.reduce((s, r) => s + ((r.amount_paid as number) || 0), 0)
    let status = 'unpaid'
    if (recs.length === 0) status = 'empty'
    else if (paid >= due && due > 0) status = 'paid'
    else if (paid > 0) status = 'partial'
    return { fee_type: ft.value, label: ft.label, records: recs, due, paid, status }
  }),
)

const adjustmentRows = computed(() =>
  FEE_TYPES.filter((ft) => ft.source === 'adjustment').map((ft) => {
    const list = buckets.value.adjustments[ft.value] || []
     
    const amount = list.reduce((s: number, a) => s + ((a.amount as number) || 0), 0)
    return { fee_type: ft.value, label: ft.label, adj_type: ft.adj_type, items: list, amount }
  }),
)

const totals = computed(() => {
  const due = recordRows.value.reduce((s, r) => s + r.due, 0)
  const paid = recordRows.value.reduce((s, r) => s + r.paid, 0)
  const adjTotal = adjustmentRows.value.reduce((s, r) => s + r.amount, 0)
  const netDue = Math.max(due - adjTotal, 0)
  return { due, paid, adjTotal, netDue, unpaid: Math.max(netDue - paid, 0) }
})

// ─── 繳費 dialog（單筆 record） ───────────────────────────────────────────────
const payDialogVisible = ref(false)
const payingRecord = ref<Record<string, unknown> | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const payFormRef = ref<any>(null)
const saving = ref(false)
const payForm = ref({ payment_date: '', amount_paid: 0, payment_method: '現金', notes: '' })
const payRules = {
  payment_date: [{ required: true, message: '請選擇繳費日期', trigger: 'change' }],
  payment_method: [{ required: true, message: '請選擇繳費方式', trigger: 'change' }],
}

function openPayDialog(rec: Record<string, unknown>) {
  if (!canWrite.value) return
  payingRecord.value = rec
  payForm.value = {
    payment_date: (rec.payment_date as string) || todayISO(),
    amount_paid: rec.status === 'partial' ? (rec.amount_paid as number) : (rec.amount_due as number),
    payment_method: (rec.payment_method as string) || '現金',
    notes: (rec.notes as string) || '',
  }
  payDialogVisible.value = true
}

async function submitPay() {
  const valid = await payFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await payFeeRecord(payingRecord.value!.id as number, payForm.value)
    ElMessage.success('繳費登記成功')
    payDialogVisible.value = false
    fetchData()
  } catch (err) {
    ElMessage.error(apiError(err, '登記繳費失敗'))
  } finally {
    saving.value = false
  }
}

// ─── 退費 modal ───────────────────────────────────────────────────────────────
const refundModalVisible = ref(false)
const refundTarget = ref<Record<string, unknown> | null>(null)
function openRefundModal(rec: Record<string, unknown>) {
  if (!canWrite.value) return
  refundTarget.value = rec
  refundModalVisible.value = true
}

// ─── 折抵編輯 dialog ──────────────────────────────────────────────────────────
const adjDialogVisible = ref(false)
const adjDialogStudent = ref<Record<string, unknown> | null>(null)
const adjDialogType = ref('')
const adjDialogExisting = ref<Record<string, unknown>[]>([])

const adjEditablePeriod = computed(() => period.value && period.value !== ALL_PERIODS)

// template helpers for typed access
const payingRecordAmountDue = computed(() => (payingRecord.value?.amount_due as number) ?? 999999)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const refundTargetTyped = computed(() => refundTarget.value as any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adjDialogExistingTyped = computed(() => adjDialogExisting.value as any)

function openAdjustmentDialog(row: Record<string, unknown>) {
  if (!canWrite.value) return
  if (!adjEditablePeriod.value) {
    ElMessage.warning('請先選擇具體學期後再編輯折抵')
    return
  }
  adjDialogStudent.value = {
    student_id: props.studentId,
    id: props.studentId,
    student_name: props.studentName || '學生',
  }
  adjDialogType.value = row.adj_type as string
  adjDialogExisting.value = (row.items as Record<string, unknown>[]) || []
  adjDialogVisible.value = true
}

defineExpose({
  refresh: fetchData,
  // 測試用
  recordRows,
  adjustmentRows,
  totals,
  period,
})
</script>

<template>
  <div class="fees-tab">
    <el-empty v-if="!canRead" description="您沒有檢視學費的權限" />
    <template v-else>
      <!-- ── toolbar：學期 + 重新整理 ── -->
      <div class="toolbar">
        <div class="filters">
          <el-select v-model="period" style="width: 160px" size="small">
            <el-option :value="ALL_PERIODS" label="全部學期" />
            <el-option
              v-for="p in periodOptions"
              :key="p"
              :value="p"
              :label="p"
            />
          </el-select>
        </div>
        <el-button size="small" :icon="Refresh" @click="fetchData">重新整理</el-button>
      </div>

      <!-- ── KPI 區（已載入才顯示） ── -->
      <div v-if="loaded" class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">應收（淨額）</div>
          <div class="kpi-value">{{ totals.netDue.toLocaleString() }}</div>
          <div class="kpi-meta">
            原應收 {{ totals.due.toLocaleString() }}
            <span v-if="totals.adjTotal > 0"> · 折抵 -{{ totals.adjTotal.toLocaleString() }}</span>
          </div>
        </div>
        <div class="kpi-card kpi-success">
          <div class="kpi-label">已收</div>
          <div class="kpi-value">{{ totals.paid.toLocaleString() }}</div>
        </div>
        <div class="kpi-card" :class="{ 'kpi-danger': totals.unpaid > 0 }">
          <div class="kpi-label">未收</div>
          <div class="kpi-value">{{ totals.unpaid.toLocaleString() }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">折抵</div>
          <div class="kpi-value">-{{ totals.adjTotal.toLocaleString() }}</div>
          <div class="kpi-meta">{{ period === ALL_PERIODS ? '全期合計' : period }}</div>
        </div>
      </div>

      <!-- ── 應收項目 ── -->
      <section v-loading="loading" class="fee-section">
        <header class="section-header">
          <span class="section-title">應收項目</span>
          <span class="section-meta">點開操作繳費 / 退費</span>
        </header>
        <el-table :data="recordRows" size="small" stripe row-key="fee_type">
          <el-table-column label="費用類型" prop="label" width="120" />
          <el-table-column label="應繳" width="110" align="right">
            <template #default="{ row }">
              <span v-if="row.status === 'empty'" class="muted">—</span>
              <span v-else>{{ row.due.toLocaleString() }}</span>
            </template>
          </el-table-column>
          <el-table-column label="已繳" width="110" align="right">
            <template #default="{ row }">
              <span v-if="row.status === 'empty'" class="muted">—</span>
              <span v-else>{{ row.paid.toLocaleString() }}</span>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="90">
            <template #default="{ row }">
              <el-tag
                v-if="row.status !== 'empty'"
                :type="RECORD_STATUS_TYPE[row.status] || 'info'"
                size="small"
              >
                {{ RECORD_STATUS_LABEL[row.status] }}
              </el-tag>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="筆數" width="60" align="center">
            <template #default="{ row }">
              <span v-if="row.records.length === 0" class="muted">—</span>
              <span v-else>{{ row.records.length }}</span>
            </template>
          </el-table-column>
          <el-table-column label="明細與操作" min-width="280">
            <template #default="{ row }">
              <div v-if="row.records.length === 0" class="muted">—</div>
              <div v-else class="record-lines">
                <div v-for="rec in (row.records as Record<string, unknown>[])" :key="rec.id as PropertyKey" class="record-line">
                  <span class="line-period">{{ rec.period || '-' }}</span>
                  <span class="line-name">{{ rec.fee_item_name || row.label }}</span>
                  <span class="line-amount">
                    {{ ((rec.amount_due as number) || 0).toLocaleString() }} / {{ ((rec.amount_paid as number) || 0).toLocaleString() }}
                  </span>
                  <el-tag :type="RECORD_STATUS_TYPE[rec.status as string] || 'info'" size="small">
                    {{ RECORD_STATUS_LABEL[rec.status as string] || rec.status }}
                  </el-tag>
                  <el-button
                    v-if="canWrite && rec.status !== 'paid'"
                    size="small"
                    type="primary"
                    link
                    @click="openPayDialog(rec)"
                  >{{ rec.status === 'partial' ? '更新繳費' : '繳費' }}</el-button>
                  <el-button
                    v-if="canWrite && ((rec.amount_paid as number) || 0) > 0"
                    size="small"
                    type="danger"
                    link
                    @click="openRefundModal(rec)"
                  >退費</el-button>
                </div>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <!-- ── 折抵項目 ── -->
      <section class="fee-section">
        <header class="section-header">
          <span class="section-title">折抵項目</span>
          <span class="section-meta">
            <template v-if="!adjEditablePeriod">須選具體學期才能編輯</template>
            <template v-else>同胞優惠 / 預繳 / 請假扣款 / 其他</template>
          </span>
        </header>
        <el-table :data="adjustmentRows" size="small" stripe row-key="fee_type">
          <el-table-column label="折抵類型" prop="label" width="140" />
          <el-table-column label="金額" width="120" align="right">
            <template #default="{ row }">
              <span v-if="row.amount === 0" class="muted">—</span>
              <span v-else class="text-warning">-{{ row.amount.toLocaleString() }}</span>
            </template>
          </el-table-column>
          <el-table-column label="筆數" width="60" align="center">
            <template #default="{ row }">
              <span v-if="row.items.length === 0" class="muted">—</span>
              <span v-else>{{ row.items.length }}</span>
            </template>
          </el-table-column>
          <el-table-column label="備註">
            <template #default="{ row }">
              <span v-if="row.items.length === 0" class="muted">—</span>
              <span v-else>
                {{ (row.items as Record<string, unknown>[]).map((a) => a.reason || a.notes || '—').join('； ') }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="right">
            <template #default="{ row }">
              <el-button
                v-if="canWrite"
                size="small"
                type="primary"
                link
                :disabled="!adjEditablePeriod"
                @click="openAdjustmentDialog(row)"
              >
                {{ row.items.length ? '編輯' : '新增' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <el-empty
        v-if="loaded && !loading && records.length === 0 && adjustments.length === 0"
        description="尚無學費紀錄"
      />

      <!-- ── 繳費 dialog ── -->
      <el-dialog v-model="payDialogVisible" title="登記繳費" width="420px" destroy-on-close>
        <div v-if="payingRecord">
          <p>
            費用項目：{{ payingRecord.fee_item_name || (FEE_TYPE_LABELS as Record<string, string>)[payingRecord.fee_type as string] || payingRecord.fee_type }}
            — 應繳 <strong>{{ (payingRecord.amount_due || 0).toLocaleString() }} 元</strong>
          </p>
          <p v-if="payingRecord.status === 'partial'" class="hint">
            目前已登記 {{ (payingRecord.amount_paid || 0).toLocaleString() }} 元，請輸入更新後的累計已繳金額。
          </p>
          <el-form :model="payForm" :rules="payRules" ref="payFormRef" label-width="90px">
            <el-form-item label="繳費日期" prop="payment_date">
              <el-date-picker
                v-model="payForm.payment_date"
                type="date"
                placeholder="選擇日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
            <el-form-item label="累計已繳" prop="amount_paid">
              <el-input-number
                v-model="payForm.amount_paid"
                :min="1"
                :max="Math.min(payingRecordAmountDue, 999999)"
                :step="1"
                :precision="0"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="繳費方式" prop="payment_method">
              <el-select v-model="payForm.payment_method" style="width: 100%">
                <el-option label="現金" value="現金" />
                <el-option label="轉帳" value="轉帳" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
            <el-form-item label="備註">
              <el-input v-model="payForm.notes" type="textarea" :rows="2" />
            </el-form-item>
          </el-form>
        </div>
        <template #footer>
          <el-button @click="payDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submitPay">確認繳費</el-button>
        </template>
      </el-dialog>

      <!-- ── 退費 modal ── -->
      <RefundSuggestModal
        v-if="refundModalVisible"
        v-model="refundModalVisible"
        :record="refundTargetTyped"
        @refunded="fetchData"
      />

      <!-- ── 折抵編輯 ── -->
      <AdjustmentEditDialog
        v-if="adjDialogVisible"
        v-model="adjDialogVisible"
        :student="adjDialogStudent"
        :period="period === ALL_PERIODS ? '' : period"
        :adjustment-type="adjDialogType"
        :existing="adjDialogExistingTyped"
        @saved="fetchData"
      />
    </template>
  </div>
</template>

<style scoped>
.fees-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
  font-variant-numeric: tabular-nums;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
}

.filters {
  display: flex;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3, 12px);
}

.kpi-card {
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 8px;
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background: var(--el-bg-color, #fff);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kpi-label {
  font-size: var(--text-xs, 12px);
  color: var(--text-secondary, #64748b);
}

.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
}

.kpi-meta {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

.kpi-success .kpi-value { color: var(--el-color-success, #67c23a); }
.kpi-danger .kpi-value { color: var(--el-color-danger, #f56c6c); }

.fee-section {
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 8px;
  padding: var(--space-3, 12px);
  background: var(--el-bg-color, #fff);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-2, 8px);
}

.section-title {
  font-weight: 700;
  font-size: var(--text-base, 14px);
}

.section-meta {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

.record-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.record-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: var(--text-xs, 12px);
}

.line-period { color: var(--text-tertiary, #94a3b8); }
.line-name { flex-shrink: 0; }
.line-amount { font-variant-numeric: tabular-nums; }

.muted { color: var(--text-tertiary, #999); }
.text-warning { color: var(--el-color-warning, #e6a23c); font-weight: 600; }

.hint {
  color: var(--text-tertiary, #999);
  font-size: var(--text-sm, 13px);
  margin-top: var(--space-2, 8px);
}
</style>
