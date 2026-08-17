<template>
  <div class="fee-records-tab">
    <!-- ================================================================
         統計摘要（先看結論再篩選：置於 filters 與 table 之前）
         paid/partial/unpaid count 是 fee record 數 → 單位「筆」，不是「人」
    ================================================================ -->
    <section v-if="summary" class="summary-strip" data-test="fee-summary" aria-label="繳費統計摘要">
      <div class="summary-strip__main" data-test="fee-summary-main">
        <span class="summary-strip__main-label">待收金額</span>
        <strong class="summary-strip__main-value">{{ formatCurrency(summary.total_unpaid) }}</strong>
      </div>
      <dl class="summary-strip__amounts">
        <div class="summary-strip__amount">
          <dt>總應收</dt>
          <dd>{{ formatCurrency(summary.total_due) }}</dd>
        </div>
        <div class="summary-strip__amount">
          <dt>已收</dt>
          <dd>{{ formatCurrency(summary.total_paid) }}</dd>
        </div>
      </dl>
      <p class="summary-strip__statuses">
        <span class="summary-strip__status summary-strip__status--paid">已繳 {{ summary.paid_count }} 筆</span>
        <span class="summary-strip__status summary-strip__status--partial">部分繳費 {{ summary.partial_count }} 筆</span>
        <span class="summary-strip__status summary-strip__status--unpaid">未繳 {{ summary.unpaid_count }} 筆</span>
        <span class="summary-strip__status">共 {{ summary.total_count }} 筆</span>
      </p>
    </section>

    <!-- ================================================================
         Toolbar：搜尋（300ms debounce，Enter 立即查）＋狀態篩選＋清除篩選
         學期／班級為相鄰 context filters（即時套用）
    ================================================================ -->
    <div class="records-toolbar" @keyup.enter="flushSearchNow">
      <AdminListToolbar
        :search="recordFilter.student_name"
        search-placeholder="搜尋學生姓名"
        :filters="statusFilterGroups"
        :filter-values="statusFilterValues"
        :total="recordTotal"
        @update:search="onSearchInput"
        @update:filter-values="onStatusFilterChange"
      >
        <template #actions>
          <el-button data-test="fee-reset-filters" @click="resetRecordFilters">清除篩選</el-button>
        </template>
      </AdminListToolbar>
      <div class="context-filters">
        <label class="context-filter">
          <span class="context-filter__label">學期</span>
          <el-select
            v-model="recordFilter.period"
            aria-label="學期"
            placeholder="全部學期"
            clearable
            class="context-filter__control context-filter__control--period"
          >
            <el-option
              v-for="period in periodOptions"
              :key="period"
              :label="period"
              :value="period"
            />
          </el-select>
        </label>
        <label class="context-filter">
          <span class="context-filter__label">班級</span>
          <el-select
            v-model="recordFilter.classroom_name"
            aria-label="班級"
            placeholder="全部班級"
            clearable
            class="context-filter__control context-filter__control--classroom"
          >
            <el-option
              v-for="cls in classroomNameOptions"
              :key="cls.id"
              :label="cls.name"
              :value="cls.name"
              data-testid="fee-classroom-option"
            />
          </el-select>
        </label>
      </div>
    </div>

    <!-- ================================================================
         資料區：首載 skeleton／錯誤持久呈現＋重試／空狀態分「尚無」與「篩選無結果」
    ================================================================ -->
    <div class="records-table-region" :aria-busy="recordsLoading ? 'true' : 'false'">
      <TableSkeleton v-if="recordsLoading && !hasLoadedOnce" :columns="9" :rows="8" />

      <EmptyState
        v-else-if="loadError"
        data-test="fee-error-state"
        variant="error"
        title="載入費用記錄失敗"
        description="請檢查網路連線後重試"
      >
        <template #action>
          <el-button type="primary" data-test="fee-error-retry" @click="fetchRecords">重試</el-button>
        </template>
      </EmptyState>

      <template v-else-if="feeRecords.length === 0 && hasLoadedOnce">
        <EmptyState
          v-if="hasActiveFilters"
          title="目前篩選沒有結果"
          description="調整或清除篩選條件後再試"
        >
          <template #action>
            <el-button data-test="fee-empty-clear-filters" @click="resetRecordFilters">清除篩選</el-button>
          </template>
        </EmptyState>
        <EmptyState
          v-else
          title="尚無費用紀錄"
          description="可先到「費用總覽」建立範本並產生費用單"
        />
      </template>

      <template v-else>
        <el-table :data="feeRecords" v-loading="recordsLoading" border>
          <el-table-column label="學生" prop="student_name" min-width="80" />
          <el-table-column label="班級" prop="classroom_name" min-width="80" />
          <el-table-column label="費用項目" prop="fee_item_name" min-width="110" />
          <el-table-column label="學期" prop="period" width="85" />
          <el-table-column label="應繳" width="110" align="right" class-name="num-cell">
            <template #default="{ row }">{{ formatCurrency(row.amount_due) }}</template>
          </el-table-column>
          <el-table-column label="已繳" width="110" align="right" class-name="num-cell">
            <template #default="{ row }">{{ formatCurrency(row.amount_paid) }}</template>
          </el-table-column>
          <el-table-column label="狀態" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="getRecordStatusType(row.status)" size="small">
                {{ getRecordStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="繳費日期" width="120">
            <template #default="{ row }">{{ row.payment_date || '—' }}</template>
          </el-table-column>
          <el-table-column label="繳費方式" width="90">
            <template #default="{ row }">{{ row.payment_method || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="150" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status !== 'paid'"
                link
                type="primary"
                @click="openPayDialog(row, $event)"
              >{{ row.status === 'partial' ? '更新繳費' : '登記繳費' }}</el-button>
              <el-button
                v-if="(row.amount_paid || 0) > 0"
                link
                type="danger"
                @click="openRefundModal(row)"
              >退款</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分頁 -->
        <el-pagination
          v-model:current-page="recordPage"
          v-model:page-size="recordPageSize"
          :total="recordTotal"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[20, 50, 100]"
          class="records-pagination"
          @size-change="fetchRecords"
          @current-change="fetchRecords"
        />
      </template>
    </div>

    <!-- ================================================================
         Dialog：登記／更新繳費
         鐵律：amount_paid 是「入帳後累計已繳」，payload 契約不可改成本次收款
    ================================================================ -->
    <el-dialog
      v-model="payDialogVisible"
      :title="payDialogTitle"
      width="440px"
      destroy-on-close
      :before-close="onPayDialogBeforeClose"
    >
      <div v-if="payingRecord">
        <dl class="pay-context" data-test="pay-context">
          <div class="pay-context__row">
            <dt>學生</dt>
            <dd>{{ payingRecord.student_name }}（{{ payingRecord.classroom_name }}）</dd>
          </div>
          <div class="pay-context__row">
            <dt>期別</dt>
            <dd>{{ payingRecord.period }}</dd>
          </div>
          <div class="pay-context__row">
            <dt>費用項目</dt>
            <dd>{{ payingRecord.fee_item_name }}</dd>
          </div>
          <div class="pay-context__row">
            <dt>應繳</dt>
            <dd class="pay-context__num">{{ formatCurrency(payingRecord.amount_due) }}</dd>
          </div>
          <div class="pay-context__row">
            <dt>目前已繳</dt>
            <dd class="pay-context__num">{{ formatCurrency(payingRecord.amount_paid || 0) }}</dd>
          </div>
        </dl>

        <el-form :model="payForm" :rules="payRules" ref="payFormRef" label-position="top">
          <el-form-item label="繳費日期" prop="payment_date">
            <el-date-picker v-model="payForm.payment_date" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" />
          </el-form-item>
          <el-form-item label="入帳後累計已繳" prop="amount_paid">
            <el-input-number
              v-model="payForm.amount_paid"
              :min="1"
              :max="Math.min(payingRecord?.amount_due || 999999, 999999)"
              :step="1"
              :precision="0"
              aria-label="入帳後累計已繳"
              style="width: 100%"
            />
            <p class="form-hint">此欄為入帳後的「累計」已繳總額，不是本次收款金額。</p>
          </el-form-item>

          <!-- 即時試算（僅呈現，不影響送出的 payload 與後端計算） -->
          <div class="pay-calc" data-test="pay-calc" aria-live="polite">
            <p class="pay-calc__line">
              目前累計 <strong>{{ formatCurrency(payCurrentPaid) }}</strong>，更新後累計
              <strong>{{ formatCurrency(payForm.amount_paid || 0) }}</strong>
            </p>
            <p class="pay-calc__line">
              本次差額 <strong :class="{ 'pay-calc__delta--negative': payDelta < 0 }">{{ payDelta >= 0 ? '+' : '−' }}{{ formatCurrency(Math.abs(payDelta)) }}</strong>，更新後尚欠
              <strong>{{ formatCurrency(payRemaining) }}</strong>
            </p>
          </div>

          <el-alert
            v-if="payDelta < 0"
            data-test="pay-correction-warning"
            type="warning"
            :closable="false"
            show-icon
            class="pay-correction-alert"
            title="更新後累計低於目前已繳"
            description="送出後將以此金額「更正」原繳費紀錄，請確認是要修正先前登記的金額。"
          />

          <el-form-item label="繳費方式" prop="payment_method">
            <el-select v-model="payForm.payment_method" aria-label="繳費方式" style="width: 100%">
              <el-option label="現金" value="現金" />
              <el-option label="轉帳" value="轉帳" />
              <el-option label="其他" value="其他" />
            </el-select>
          </el-form-item>
          <el-form-item label="備註">
            <el-input v-model="payForm.notes" type="textarea" :rows="2" aria-label="備註" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="attemptClosePayDialog">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitPay">{{ payDialogTitle }}</el-button>
      </template>
    </el-dialog>

    <!-- ================================================================
         Modal：退費（Phase 3 - 含自動建議計算）
    ================================================================ -->
    <RefundSuggestModal
      v-if="refundModalVisible"
      v-model="refundModalVisible"
      :record="refundTarget"
      @refunded="fetchRecords"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import type { FormInstance } from 'element-plus'
import { getFeeRecords, payFeeRecord, getFeeSummary } from '@/api/fees'
import { todayISO } from '@/utils/format'
import { formatCurrency } from '@/utils/currency'
import { confirmDiscardChanges } from '@/composables/useUnsavedChangesGuard'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import RefundSuggestModal from '@/components/fees/RefundSuggestModal.vue'

interface Classroom {
  id: number
  name: string
}

interface FeeRow {
  id: number
  student_name: string
  classroom_name: string
  fee_item_name: string
  period: string
  amount_due: number
  amount_paid: number
  status: string
  payment_date?: string
  payment_method?: string
  notes?: string
  fee_type?: string
}

interface FeeSummary {
  total_count: number
  total_due: number
  total_paid: number
  paid_count: number
  partial_count: number
  unpaid_count: number
  total_unpaid: number
}

const props = withDefaults(defineProps<{
  periodOptions?: string[]
  classrooms?: Classroom[]
}>(), {
  periodOptions: () => [],
  classrooms: () => [],
})

// 這個篩選的值是 classroom_name（後端按班名比對），而班級清單是跨學期的，
// 114-2 與 115-1 的同名班會變成兩個同名同值的選項 → 按班名去重，保留先出現者。
const classroomNameOptions = computed(() => {
  const seen = new Set<string>()
  return props.classrooms.filter(c => {
    if (seen.has(c.name)) return false
    seen.add(c.name)
    return true
  })
})

// ─── 繳費記錄 ─────────────────────────────────────────────────────────────────
const feeRecords = ref<FeeRow[]>([])
const recordsLoading = ref<boolean>(false)
const hasLoadedOnce = ref<boolean>(false)
const loadError = ref<boolean>(false)
const emptyRecordFilter = () => ({
  period: '',
  classroom_name: '',
  status: '',
  student_name: '',
})
const recordFilter = ref(emptyRecordFilter())
const recordPage = ref<number>(1)
const recordPageSize = ref<number>(50)
const recordTotal = ref<number>(0)
const summary = ref<FeeSummary | null>(null)

const hasActiveFilters = computed(() => {
  const f = recordFilter.value
  return Boolean(f.period || f.classroom_name || f.status || f.student_name)
})

// ─── AdminListToolbar：狀態篩選（段落鈕，即時套用） ─────────────────────────
const statusFilterGroups = [
  {
    key: 'status',
    label: '繳費狀態',
    options: [
      { label: '未繳', value: 'unpaid' },
      { label: '部分繳費', value: 'partial' },
      { label: '已繳', value: 'paid' },
    ],
  },
]
const statusFilterValues = computed<Record<string, unknown>>(() =>
  recordFilter.value.status ? { status: recordFilter.value.status } : {},
)
function onStatusFilterChange(next: Record<string, unknown>) {
  recordFilter.value.status = typeof next.status === 'string' ? next.status : ''
}
function onSearchInput(v: string) {
  recordFilter.value.student_name = v
}

function _buildRecordParams() {
  const params: Record<string, unknown> = { page: recordPage.value, page_size: recordPageSize.value }
  if (recordFilter.value.period) params.period = recordFilter.value.period
  if (recordFilter.value.classroom_name) params.classroom_name = recordFilter.value.classroom_name
  if (recordFilter.value.status) params.status = recordFilter.value.status
  if (recordFilter.value.student_name) params.student_name = recordFilter.value.student_name
  return params
}

// request sequence 守衛：晚發先回時，舊 response 不得覆蓋新條件的結果
let _fetchSeq = 0

async function fetchRecords() {
  const seq = ++_fetchSeq
  recordsLoading.value = true
  try {
    const params = _buildRecordParams()
    const [res, sum] = await Promise.all([
      getFeeRecords(params),
      getFeeSummary(params),
    ])
    if (seq !== _fetchSeq) return
    feeRecords.value = (res as { items: FeeRow[] }).items
    recordTotal.value = (res as { total: number }).total
    summary.value = sum as FeeSummary
    loadError.value = false
    hasLoadedOnce.value = true
  } catch (e) {
    if (seq !== _fetchSeq) return
    // 錯誤要持久呈現（EmptyState + 重試），toast 只是輔助
    loadError.value = true
    ElMessage.error(friendlyError('載入費用記錄失敗', e))
  } finally {
    if (seq === _fetchSeq) recordsLoading.value = false
  }
}

function searchRecords() {
  recordPage.value = 1
  return fetchRecords()
}

// 父層（全域搜尋導航）帶入學生姓名預篩。
// 只設 student_name → 觸發既有 watcher（page 歸 1 + 300ms debounce fetch），不重複呼叫 fetch。
function applySearch(name: string) {
  recordFilter.value.student_name = name
}

// 學生姓名即時搜尋（300ms debounce）；Enter 立即查（flushSearchNow）
let _feeSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => recordFilter.value.student_name, () => {
  if (_suppressFilterWatch) return
  clearTimeout(_feeSearchTimer ?? undefined)
  _feeSearchTimer = setTimeout(() => {
    _feeSearchTimer = null
    searchRecords()
  }, 300)
})

function flushSearchNow() {
  if (_feeSearchTimer) {
    clearTimeout(_feeSearchTimer)
    _feeSearchTimer = null
  }
  searchRecords()
}

// reset 一次改四個欄位，靠 suppress 旗標讓個別 watcher 靜默，只發出這裡的單一 fetch
let _suppressFilterWatch = false
function resetRecordFilters() {
  _suppressFilterWatch = true
  if (_feeSearchTimer) {
    clearTimeout(_feeSearchTimer)
    _feeSearchTimer = null
  }
  recordFilter.value = emptyRecordFilter()
  recordPage.value = 1
  nextTick(() => {
    _suppressFilterWatch = false
  })
  return fetchRecords()
}

function getRecordStatusLabel(status: string): string {
  if (status === 'paid') return '已繳'
  if (status === 'partial') return '部分繳費'
  return '未繳'
}

function getRecordStatusType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  return 'info'
}

// ─── 登記／更新繳費 ──────────────────────────────────────────────────────────
const payDialogVisible = ref<boolean>(false)
const payingRecord = ref<FeeRow | null>(null)
const payFormRef = ref<FormInstance | null>(null)
const saving = ref<boolean>(false)
const payForm = ref({
  payment_date: '',
  amount_paid: 0,
  payment_method: '現金',
  notes: '',
})
const payRules = {
  payment_date: [{ required: true, message: '請選擇繳費日期', trigger: 'change' }],
  payment_method: [{ required: true, message: '請選擇繳費方式', trigger: 'change' }],
}

const payDialogTitle = computed(() =>
  payingRecord.value?.status === 'partial' ? '更新繳費' : '登記繳費',
)
const payCurrentPaid = computed(() => payingRecord.value?.amount_paid || 0)
// 差額／尚欠僅為呈現用試算；amount_paid payload 仍是「入帳後累計」，計算規則不變
const payDelta = computed(() => (payForm.value.amount_paid || 0) - payCurrentPaid.value)
const payRemaining = computed(() =>
  Math.max((payingRecord.value?.amount_due || 0) - (payForm.value.amount_paid || 0), 0),
)

// dirty 判定：開啟當下拍快照，關閉前比對；髒表單走既有 confirmDiscardChanges 確認
let _payFormSnapshot = ''
let _payReturnFocusEl: HTMLElement | null = null

function openPayDialog(row: FeeRow, evt?: Event) {
  payingRecord.value = row
  payForm.value = {
    payment_date: todayISO(),
    amount_paid: row.status === 'partial' ? row.amount_paid : row.amount_due,
    payment_method: row.payment_method || '現金',
    notes: row.notes || '',
  }
  _payFormSnapshot = JSON.stringify(payForm.value)
  _payReturnFocusEl = (evt?.currentTarget as HTMLElement | null) ?? null
  payDialogVisible.value = true
}

const isPayFormDirty = () => JSON.stringify(payForm.value) !== _payFormSnapshot

async function attemptClosePayDialog() {
  if (isPayFormDirty() && !(await confirmDiscardChanges())) return
  payDialogVisible.value = false
}

// el-dialog 的 X／遮罩關閉走 before-close；取消鈕走 attemptClosePayDialog
async function onPayDialogBeforeClose(done: () => void) {
  if (!isPayFormDirty() || (await confirmDiscardChanges())) done()
}

async function submitPay() {
  const valid = await payFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await payFeeRecord((payingRecord.value as FeeRow).id, payForm.value)
    ElMessage.success('繳費登記成功')
    payDialogVisible.value = false
    fetchRecords()
    // 成功後 focus 回觸發操作的 row 按鈕（可及性：鍵盤操作不迷航）
    const el = _payReturnFocusEl
    nextTick(() => el?.focus?.())
  } catch (err: unknown) {
    const e = err as { response?: { data?: { detail?: string } } }
    ElMessage.error(e?.response?.data?.detail || '登記繳費失敗')
  } finally {
    saving.value = false
  }
}

// ─── 退費（Phase 3：自動建議計算 modal） ───────────────────────────────────────
interface FeeRecord {
  id: number
  student_name?: string
  fee_item_name?: string
  fee_type?: string
  amount_due?: number
  amount_paid?: number
  [key: string]: unknown
}
const refundModalVisible = ref<boolean>(false)
const refundTarget = ref<FeeRecord | null>(null)

function openRefundModal(row: FeeRow) {
  refundTarget.value = row as unknown as FeeRecord
  refundModalVisible.value = true
}

// ─── 篩選 watcher（下拉／段落鈕即時套用；reset 期間由 suppress 旗標靜默） ────
watch(() => recordFilter.value.period, () => {
  if (!_suppressFilterWatch) searchRecords()
})
watch(() => recordFilter.value.status, () => {
  if (!_suppressFilterWatch) searchRecords()
})
watch(() => recordFilter.value.classroom_name, () => {
  if (!_suppressFilterWatch) searchRecords()
})

defineExpose({
  fetchRecords,
  applySearch,
  // 暴露給測試或父層存取需要的內部 state（白盒測試用）
  recordFilter,
  recordPage,
  recordPageSize,
  feeRecords,
  summary,
  loadError,
  payingRecord,
  payForm,
  payFormRef,
  openPayDialog,
  submitPay,
  resetRecordFilters,
})
</script>

<style scoped>
.fee-records-tab {
  width: 100%;
}

/* ─── 統計摘要 strip ─────────────────────────────────────────────────────── */
.summary-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-6);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-lg);
  background: var(--bg-color);
}

.summary-strip__main {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.summary-strip__main-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.summary-strip__main-value {
  font-size: var(--text-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.summary-strip__amounts {
  display: flex;
  gap: var(--space-4);
  margin: 0;
}

.summary-strip__amount {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
}

.summary-strip__amount dt {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.summary-strip__amount dd {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.summary-strip__statuses {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  margin-inline-start: auto;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.summary-strip__status--paid {
  color: var(--color-success-darker);
}

.summary-strip__status--partial {
  color: var(--color-warning-darker);
}

.summary-strip__status--unpaid {
  color: var(--color-danger-darker);
}

/* ─── Toolbar 與 context filters ────────────────────────────────────────── */
.records-toolbar {
  margin-bottom: var(--space-2);
}

.context-filters {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}

.context-filter {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.context-filter__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  white-space: nowrap;
}

.context-filter__control--period {
  width: 150px;
}

.context-filter__control--classroom {
  width: 140px;
}

@media (--to-sm) {
  .context-filters {
    width: 100%;
  }
  .context-filter {
    flex: 1 1 auto;
  }
  .context-filter__control--period,
  .context-filter__control--classroom {
    width: 100%;
    flex: 1 1 auto;
  }
  /* 行動端互動目標對齊 44px（--touch-target-min） */
  .context-filter :deep(.el-select__wrapper) {
    min-height: var(--touch-target-min);
  }
  .fee-records-tab :deep(.el-table .el-button) {
    min-height: var(--touch-target-min);
  }
}

/* ─── 表格區 ───────────────────────────────────────────────────────────── */
.records-pagination {
  margin-top: var(--space-3);
  justify-content: flex-end;
}

/* ─── 付款 dialog ─────────────────────────────────────────────────────── */
.pay-context {
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--bg-color);
}

.pay-context__row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 2px 0;
}

.pay-context__row dt {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  white-space: nowrap;
}

.pay-context__row dd {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
  text-align: right;
}

.pay-context__num {
  font-variant-numeric: tabular-nums;
}

.form-hint {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  line-height: var(--line-height-base);
}

.pay-calc {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-color);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.pay-calc__line {
  margin: 2px 0;
}

.pay-calc strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.pay-calc__delta--negative {
  color: var(--color-danger-darker);
}

.pay-correction-alert {
  margin-bottom: var(--space-3);
}
</style>
