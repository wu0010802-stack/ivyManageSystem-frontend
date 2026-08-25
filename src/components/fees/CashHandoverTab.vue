<template>
  <div class="cash-handover-tab">
    <div class="toolbar">
      <el-button v-if="canWrite" type="primary" data-test="open-cash" @click="openCashDialog">
        ＋ 登記現金收款
      </el-button>
      <el-button @click="fetchBatches">重新整理</el-button>
      <span class="hint">
        鐵律：會計收多少現金就全額交付老闆；預繳退款是老闆另行支出、不從交接扣除
      </span>
    </div>

    <el-table :data="batches" size="small" border v-loading="loading" data-test="handover-table">
      <el-table-column prop="business_date" label="交接日" width="110" />
      <el-table-column label="當日現金收款" width="130" align="right">
        <template #default="{ row }">{{ formatCurrency(row.cash_receipt_total) }}</template>
      </el-table-column>
      <el-table-column label="應交付（凍結）" width="130" align="right">
        <template #default="{ row }">
          {{ row.expected_cash_amount != null ? formatCurrency(row.expected_cash_amount) : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="老闆實收" width="120" align="right">
        <template #default="{ row }">
          {{ row.owner_actual_amount != null ? formatCurrency(row.owner_actual_amount) : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="差異" width="110" align="right">
        <template #default="{ row }">
          <span
            v-if="row.variance != null"
            :class="{ 'variance-bad': row.variance !== 0 }"
            data-test="variance-cell"
          >
            {{ formatCurrency(row.variance) }}
          </span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)" size="small">
            {{ STATUS_LABELS[row.status] ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="220">
        <template #default="{ row }">
          <el-button
            v-if="canWrite && ['draft', 'reopened'].includes(row.status)"
            size="small"
            type="primary"
            text
            data-test="submit-handover"
            @click="doSubmit(row)"
          >
            提交交接
          </el-button>
          <el-button
            v-if="canApprove && row.status === 'submitted'"
            size="small"
            type="success"
            text
            data-test="confirm-handover"
            @click="openConfirm(row)"
          >
            老闆簽收
          </el-button>
          <el-button
            v-if="canApprove && ['submitted', 'confirmed'].includes(row.status)"
            size="small"
            type="warning"
            text
            @click="doReopen(row)"
          >
            Reopen
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 現金收款 dialog -->
    <el-dialog v-model="cashVisible" title="登記現金收款" width="640px" data-test="cash-dialog">
      <el-form label-width="90px">
        <el-form-item label="收款日期">
          <el-date-picker v-model="cashForm.received_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="學生姓名">
          <el-input
            v-model="cashSearch"
            placeholder="輸入姓名關鍵字查未繳費用單"
            style="width: 240px"
            @keyup.enter="searchUnpaid"
          />
          <el-button @click="searchUnpaid">查詢</el-button>
        </el-form-item>
        <el-table
          :data="unpaidRecords"
          size="small"
          border
          max-height="220"
          @selection-change="(rows: FeeRecordRow[]) => (selectedRecords = rows)"
        >
          <el-table-column type="selection" width="40" />
          <el-table-column prop="student_name" label="學生" width="100" />
          <el-table-column prop="fee_item_name" label="項目" min-width="110" />
          <el-table-column prop="period" label="學期" width="80" />
          <el-table-column label="未繳" width="110" align="right">
            <template #default="{ row }">
              {{ formatCurrency(row.amount_due - row.amount_paid) }}
            </template>
          </el-table-column>
        </el-table>
        <el-form-item label="含預繳款" class="mt-1">
          <el-switch v-model="cashForm.withPrepay" />
          <template v-if="cashForm.withPrepay">
            <el-input-number
              v-model="cashForm.prepayStudentId"
              :controls="false"
              placeholder="學生 ID"
              style="width: 110px"
            />
            <el-input-number
              v-model="cashForm.prepayYear"
              :controls="false"
              placeholder="目標學年"
              style="width: 100px"
            />
            <el-select v-model="cashForm.prepaySemester" style="width: 90px" placeholder="學期">
              <el-option label="上" :value="1" />
              <el-option label="下" :value="2" />
            </el-select>
          </template>
        </el-form-item>
        <el-form-item label="收款合計">
          <strong data-test="cash-total">{{ formatCurrency(cashTotal) }}</strong>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cashVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="cashTotal <= 0 || !cashForm.received_date"
          :loading="cashSubmitting"
          data-test="cash-confirm"
          @click="submitCash"
        >
          確認收款
        </el-button>
      </template>
    </el-dialog>

    <!-- 老闆簽收 dialog -->
    <el-dialog v-model="confirmVisible" title="老闆簽收現金交接" width="480px" data-test="confirm-dialog">
      <template v-if="confirmBatch">
        <p>
          {{ confirmBatch.business_date }}｜會計應交付
          <strong>{{ formatCurrency(confirmBatch.expected_cash_amount ?? 0) }}</strong>
        </p>
        <el-form label-width="110px">
          <el-form-item label="實際收到金額" required>
            <el-input-number
              v-model="confirmForm.actual"
              :min="0"
              :controls="false"
              style="width: 180px"
              data-test="owner-actual-input"
            />
          </el-form-item>
          <el-form-item label="差異">
            <span :class="{ 'variance-bad': confirmVariance !== 0 }" data-test="confirm-variance">
              {{ formatCurrency(confirmVariance) }}
            </span>
          </el-form-item>
          <el-form-item v-if="confirmVariance !== 0" label="差異原因" required>
            <el-input v-model="confirmForm.reason" type="textarea" :rows="2" data-test="variance-reason" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="confirmVisible = false">取消</el-button>
        <el-button
          type="success"
          :disabled="confirmForm.actual == null || (confirmVariance !== 0 && !confirmForm.reason.trim())"
          data-test="owner-confirm"
          @click="submitConfirm"
        >
          確認簽收
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { todayISO } from '@/utils/format'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import {
  confirmCashHandover,
  createCashReceipt,
  getCashHandovers,
  getFeeRecords,
  reopenCashHandover,
  submitCashHandover,
} from '@/api/fees'

interface BatchRow {
  id: number
  business_date: string
  status: string
  cash_receipt_total: number
  expected_cash_amount: number | null
  owner_actual_amount: number | null
  variance: number | null
}
interface FeeRecordRow {
  id: number
  student_name: string
  fee_item_name: string
  period: string
  amount_due: number
  amount_paid: number
}

const STATUS_LABELS: Record<string, string> = {
  draft: '收款中',
  submitted: '已提交（待簽收）',
  confirmed: '老闆已簽收',
  reopened: '已重開',
}

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))
const canApprove = computed(() => hasPermission(PERMISSION_NAMES.FEE_CLOSE_APPROVE))

const batches = ref<BatchRow[]>([])
const loading = ref(false)

const cashVisible = ref(false)
const cashSubmitting = ref(false)
const cashSearch = ref('')
const unpaidRecords = ref<FeeRecordRow[]>([])
const selectedRecords = ref<FeeRecordRow[]>([])
const cashForm = reactive({
  received_date: todayISO(),
  withPrepay: false,
  prepayStudentId: undefined as number | undefined,
  prepayYear: undefined as number | undefined,
  prepaySemester: undefined as number | undefined,
})

const confirmVisible = ref(false)
const confirmBatch = ref<BatchRow | null>(null)
const confirmForm = reactive({ actual: undefined as number | undefined, reason: '' })
const confirmVariance = computed(() =>
  confirmForm.actual != null && confirmBatch.value
    ? confirmForm.actual - (confirmBatch.value.expected_cash_amount ?? 0)
    : 0,
)

const cashTotal = computed(() => {
  const records = selectedRecords.value.reduce(
    (sum, r) => sum + (r.amount_due - r.amount_paid),
    0,
  )
  return records + (cashForm.withPrepay ? 5000 : 0)
})

function statusTag(status: string): 'success' | 'info' | 'warning' {
  return (
    ({ draft: 'info', submitted: 'warning', confirmed: 'success', reopened: 'warning' } as const)[
      status
    ] ?? 'info'
  )
}

async function fetchBatches() {
  loading.value = true
  try {
    const data = await getCashHandovers()
    batches.value = data.items as BatchRow[]
  } catch (e) {
    ElMessage.error(friendlyError('載入交接批次失敗', e))
  } finally {
    loading.value = false
  }
}

function openCashDialog() {
  cashVisible.value = true
  unpaidRecords.value = []
  selectedRecords.value = []
  cashSearch.value = ''
}

async function searchUnpaid() {
  if (!cashSearch.value.trim()) return
  try {
    const data = await getFeeRecords({
      student_name: cashSearch.value.trim(),
      page: 1,
      page_size: 50,
    })
    unpaidRecords.value = (data.items as FeeRecordRow[]).filter(
      (r) => r.amount_due > r.amount_paid,
    )
  } catch (e) {
    ElMessage.error(friendlyError('查詢未繳費用單失敗', e))
  }
}

async function submitCash() {
  const parts: Record<string, unknown>[] = selectedRecords.value.map((r) => ({
    part_type: 'fee_record',
    fee_record_id: r.id,
    amount: r.amount_due - r.amount_paid,
  }))
  if (cashForm.withPrepay) {
    parts.push({
      part_type: 'prepayment',
      student_id: cashForm.prepayStudentId,
      amount: 5000,
      target_school_year: cashForm.prepayYear,
      target_semester: cashForm.prepaySemester,
    })
  }
  cashSubmitting.value = true
  try {
    await createCashReceipt({
      amount: cashTotal.value,
      received_date: cashForm.received_date,
      parts: parts as never,
      idempotency_key: `cashui-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    })
    ElMessage.success('現金收款已登記並掛入當日交接批')
    cashVisible.value = false
    fetchBatches()
  } catch (e) {
    ElMessage.error(friendlyError('收款失敗', e))
  } finally {
    cashSubmitting.value = false
  }
}

async function doSubmit(row: BatchRow) {
  try {
    await ElMessageBox.confirm(
      `提交後凍結應交付金額 ${formatCurrency(row.cash_receipt_total)}，且當日不可再新增現金收款。`,
      '提交交接',
    )
  } catch {
    return
  }
  try {
    await submitCashHandover(row.id)
    ElMessage.success('已提交，待老闆簽收')
    fetchBatches()
  } catch (e) {
    ElMessage.error(friendlyError('提交失敗', e))
  }
}

function openConfirm(row: BatchRow) {
  confirmBatch.value = row
  confirmForm.actual = undefined
  confirmForm.reason = ''
  confirmVisible.value = true
}

async function submitConfirm() {
  if (!confirmBatch.value || confirmForm.actual == null) return
  try {
    await confirmCashHandover(confirmBatch.value.id, {
      owner_actual_amount: confirmForm.actual,
      variance_reason: confirmForm.reason || null,
    })
    ElMessage.success('簽收完成')
    confirmVisible.value = false
    fetchBatches()
  } catch (e) {
    ElMessage.error(friendlyError('簽收失敗', e))
  }
}

async function doReopen(row: BatchRow) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('請輸入 reopen 原因', 'Reopen 交接批', {
      inputValidator: (v) => (v && v.trim().length >= 5 ? true : '原因至少 5 字'),
    })
    reason = typeof result === 'object' ? result.value : ''
  } catch {
    return
  }
  try {
    await reopenCashHandover(row.id, { reason })
    ElMessage.success('已 reopen')
    fetchBatches()
  } catch (e) {
    ElMessage.error(friendlyError('reopen 失敗', e))
  }
}

onMounted(fetchBatches)
defineExpose({ fetchBatches })
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.variance-bad {
  color: var(--el-color-danger);
  font-weight: 600;
}
.mt-1 {
  margin-top: 8px;
}
</style>
