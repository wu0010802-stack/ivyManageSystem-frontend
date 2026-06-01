<template>
  <div class="fee-records-tab">
    <div class="toolbar">
      <div class="filters">
        <el-select
          v-model="recordFilter.period"
          placeholder="學期"
          clearable
          style="width: 150px"
        >
          <el-option
            v-for="period in periodOptions"
            :key="period"
            :label="period"
            :value="period"
          />
        </el-select>
        <el-select
          v-model="recordFilter.classroom_name"
          placeholder="班級"
          clearable
          style="width: 130px"
        >
          <el-option
            v-for="cls in classrooms"
            :key="cls.id"
            :label="cls.name"
            :value="cls.name"
          />
        </el-select>
        <el-input
          v-model="recordFilter.student_name"
          placeholder="學生姓名"
          clearable
          style="width: 130px"
          @keyup.enter="searchRecords"
        />
        <el-select v-model="recordFilter.status" placeholder="繳費狀態" clearable style="width: 120px">
          <el-option label="未繳" value="unpaid" />
          <el-option label="部分繳費" value="partial" />
          <el-option label="已繳" value="paid" />
        </el-select>
        <el-button @click="searchRecords">搜尋</el-button>
        <el-button @click="resetRecordFilters">重設</el-button>
      </div>
    </div>

    <el-table :data="feeRecords" v-loading="recordsLoading" border>
      <el-table-column label="學生" prop="student_name" min-width="80" />
      <el-table-column label="班級" prop="classroom_name" min-width="80" />
      <el-table-column label="費用項目" prop="fee_item_name" min-width="110" />
      <el-table-column label="學期" prop="period" width="85" />
      <el-table-column label="應繳" width="110" align="right">
        <template #default="{ row }">{{ formatCurrency(row.amount_due) }}</template>
      </el-table-column>
      <el-table-column label="已繳" width="110" align="right">
        <template #default="{ row }">{{ formatCurrency(row.amount_paid) }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="getRecordStatusType(row.status)" size="small">
            {{ getRecordStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="繳費日期" width="105">
        <template #default="{ row }">{{ row.payment_date || '—' }}</template>
      </el-table-column>
      <el-table-column label="繳費方式" width="90">
        <template #default="{ row }">{{ row.payment_method || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="170" align="center" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status !== 'paid'"
            size="small"
            type="primary"
            @click="openPayDialog(row)"
          >{{ row.status === 'partial' ? '更新繳費' : '登記繳費' }}</el-button>
          <el-button
            v-if="(row.amount_paid || 0) > 0"
            size="small"
            type="danger"
            plain
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
      style="margin-top: 12px; justify-content: flex-end"
      @size-change="fetchRecords"
      @current-change="fetchRecords"
    />

    <!-- 統計摘要 -->
    <div class="summary-bar" v-if="summary">
      <el-tag type="info" size="large">總筆數：{{ summary.total_count }}</el-tag>
      <el-tag size="large">總應繳：{{ formatCurrency(summary.total_due) }}</el-tag>
      <el-tag type="success" size="large">已收：{{ formatCurrency(summary.total_paid) }}</el-tag>
      <el-tag type="success" size="large">已繳：{{ summary.paid_count }} 人</el-tag>
      <el-tag type="warning" size="large">部分繳費：{{ summary.partial_count }} 人</el-tag>
      <el-tag type="danger" size="large">未繳：{{ summary.unpaid_count }} 人</el-tag>
      <el-tag type="danger" size="large">未收：{{ formatCurrency(summary.total_unpaid) }}</el-tag>
    </div>

    <!-- ================================================================
         Dialog：登記繳費
    ================================================================ -->
    <el-dialog v-model="payDialogVisible" title="登記繳費" width="400px" destroy-on-close>
      <div v-if="payingRecord">
        <p>學生：<strong>{{ payingRecord.student_name }}</strong>（{{ payingRecord.classroom_name }}）</p>
        <p>費用項目：{{ payingRecord.fee_item_name }} — 應繳 <strong>{{ formatCurrency(payingRecord.amount_due) }}</strong></p>
        <p v-if="payingRecord.status === 'partial'" class="hint">
          目前已登記 {{ formatCurrency(payingRecord.amount_paid) }}，請輸入更新後的累計已繳金額。
        </p>
        <el-form :model="payForm" :rules="payRules" ref="payFormRef" label-width="90px">
          <el-form-item label="繳費日期" prop="payment_date">
            <el-date-picker v-model="payForm.payment_date" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" />
          </el-form-item>
          <el-form-item label="累計已繳" prop="amount_paid">
            <el-input-number
              v-model="payForm.amount_paid"
              :min="1"
              :max="Math.min(payingRecord?.amount_due || 999999, 999999)"
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
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { getFeeRecords, payFeeRecord, getFeeSummary } from '@/api/fees'
import { todayISO } from '@/utils/format'
import { formatCurrency } from '@/utils/currency'
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

withDefaults(defineProps<{
  periodOptions?: string[]
  classrooms?: Classroom[]
}>(), {
  periodOptions: () => [],
  classrooms: () => [],
})

// ─── 繳費記錄 ─────────────────────────────────────────────────────────────────
const feeRecords = ref<FeeRow[]>([])
const recordsLoading = ref<boolean>(false)
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

function _buildRecordParams() {
  const params: Record<string, unknown> = { page: recordPage.value, page_size: recordPageSize.value }
  if (recordFilter.value.period) params.period = recordFilter.value.period
  if (recordFilter.value.classroom_name) params.classroom_name = recordFilter.value.classroom_name
  if (recordFilter.value.status) params.status = recordFilter.value.status
  if (recordFilter.value.student_name) params.student_name = recordFilter.value.student_name
  return params
}

async function fetchRecords() {
  recordsLoading.value = true
  try {
    const params = _buildRecordParams()
    const [res, sum] = await Promise.all([
      getFeeRecords(params),
      getFeeSummary(params),
    ])
    feeRecords.value = (res as { items: FeeRow[] }).items
    recordTotal.value = (res as { total: number }).total
    summary.value = sum as FeeSummary
  } catch {
    ElMessage.error('載入費用記錄失敗')
  } finally {
    recordsLoading.value = false
  }
}

function searchRecords() {
  recordPage.value = 1
  fetchRecords()
}

// 學生姓名即時搜尋（300ms debounce）
let _feeSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => recordFilter.value.student_name, () => {
  clearTimeout(_feeSearchTimer ?? undefined)
  _feeSearchTimer = setTimeout(() => {
    recordPage.value = 1
    fetchRecords()
  }, 300)
})

function resetRecordFilters() {
  recordFilter.value = emptyRecordFilter()
  recordPage.value = 1
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

// ─── 登記繳費 ─────────────────────────────────────────────────────────────────
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

function openPayDialog(row: FeeRow) {
  payingRecord.value = row
  payForm.value = {
    payment_date: todayISO(),
    amount_paid: row.status === 'partial' ? row.amount_paid : row.amount_due,
    payment_method: row.payment_method || '現金',
    notes: row.notes || '',
  }
  payDialogVisible.value = true
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

// ─── 篩選 watcher ─────────────────────────────────────────────────────────────
watch(() => recordFilter.value.period, () => searchRecords())

// 下拉篩選即時觸發搜尋
watch(() => recordFilter.value.status, () => searchRecords())
watch(() => recordFilter.value.classroom_name, () => searchRecords())

defineExpose({
  fetchRecords,
  // 暴露給測試或父層存取需要的內部 state（白盒測試用）
  recordFilter,
  recordPage,
  recordPageSize,
  payingRecord,
  payFormRef,
  submitPay,
  resetRecordFilters,
})
</script>

<style scoped>
.fee-records-tab {
  width: 100%;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  gap: var(--space-3);
}

.filters {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.summary-bar {
  margin-top: var(--space-4);
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.hint {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  margin-top: var(--space-2);
}
</style>
