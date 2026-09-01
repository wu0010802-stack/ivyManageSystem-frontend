<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    title="批次登記繳費"
    width="560"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form :model="form" label-position="top">
      <el-form-item label="繳費日期" required>
        <el-date-picker
          v-model="form.payment_date"
          type="date"
          value-format="YYYY-MM-DD"
          aria-label="繳費日期"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="繳費方式" required>
        <el-select v-model="form.payment_method" aria-label="繳費方式" style="width: 100%">
          <el-option label="現金" value="現金" />
          <el-option label="轉帳" value="轉帳" />
          <el-option label="其他" value="其他" />
        </el-select>
        <p
          v-if="form.payment_method === '現金'"
          class="cash-handover-hint"
          data-test="cash-handover-hint"
        >
          現金會計入 {{ form.payment_date || '繳費日' }} 的現金交接批；該日交接送出後需先請老闆重新開啟才能再收款。
        </p>
      </el-form-item>
      <el-form-item label="備註">
        <el-input v-model="form.notes" type="textarea" :rows="2" aria-label="備註" />
      </el-form-item>
    </el-form>

    <div class="batch-pay-summary" data-test="batch-pay-summary">
      共 {{ rows.length }} 筆，待送出 {{ pendingRows.length }} 筆，合計
      <strong class="batch-pay-summary__amount">{{ formatCurrency(totalDue) }}</strong>
    </div>

    <ul class="batch-pay-list" data-test="batch-pay-list">
      <li
        v-for="row in rows"
        :key="row.record_id"
        class="batch-pay-row"
        :class="`batch-pay-row--${row.status}`"
        data-test="batch-pay-row"
      >
        <div class="batch-pay-row__main">
          <span class="batch-pay-row__name">{{ row.student_name }}（{{ row.classroom_name }}）</span>
          <span class="batch-pay-row__amount num-cell">{{ formatCurrency(row.amount_due) }}</span>
        </div>
        <p class="batch-pay-row__meta">{{ row.period }}．{{ row.fee_item_name }}</p>
        <p v-if="row.status === 'success'" class="batch-pay-row__status batch-pay-row__status--success">已完成</p>
        <p v-else-if="row.status === 'error'" class="batch-pay-row__status batch-pay-row__status--error">{{ row.error }}</p>
      </li>
    </ul>

    <template #footer>
      <el-button @click="close">{{ hasResult ? '關閉' : '取消' }}</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="pendingRows.length === 0"
        @click="submit"
      >{{ submitLabel }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { batchPayFeeRecords } from '@/api/fees'
import type { ApiBody } from '@/api/_generated/typed'
import { todayISO } from '@/utils/format'
import { formatCurrency } from '@/utils/currency'

interface BatchPayRecord {
  id: number
  student_name: string
  classroom_name: string
  fee_item_name: string
  period: string
  amount_due: number
}

interface BatchRow {
  record_id: number
  student_name: string
  classroom_name: string
  fee_item_name: string
  period: string
  amount_due: number
  idempotency_key: string
  status: 'pending' | 'success' | 'error'
  error: string | null
}

const props = defineProps<{
  modelValue: boolean
  records: BatchPayRecord[]
}>()
const emit = defineEmits<{
  'update:modelValue': [boolean]
  paid: []
}>()

// 冪等鍵：優先 crypto.randomUUID，測試環境／舊瀏覽器 fallback（比照
// usePOSCheckout/portalMessages 慣例）；後端要求 ^[A-Za-z0-9_-]{8,64}$。
function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `BPY-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const form = reactive({
  payment_date: '',
  payment_method: '現金',
  notes: '',
})

const rows = ref<BatchRow[]>([])
const submitting = ref(false)

// 開啟時重建 rows＋逐列產生新 idempotency_key（每次開啟視為新嘗試，不沿用上次）；
// 關閉不清空，讓失敗列在對話框仍開著時可原地重試。
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    form.payment_date = todayISO()
    form.payment_method = '現金'
    form.notes = ''
    rows.value = props.records.map((r) => ({
      record_id: r.id,
      student_name: r.student_name,
      classroom_name: r.classroom_name,
      fee_item_name: r.fee_item_name,
      period: r.period,
      amount_due: r.amount_due,
      idempotency_key: genIdempotencyKey(),
      status: 'pending',
      error: null,
    }))
  },
  { immediate: true },
)

// 待送出＝尚未成功的列（含尚未嘗試與上次失敗兩種）；重試只送這些，且沿用原 key。
const pendingRows = computed(() => rows.value.filter((r) => r.status !== 'success'))
const totalDue = computed(() => pendingRows.value.reduce((sum, r) => sum + r.amount_due, 0))
const hasResult = computed(() => rows.value.some((r) => r.status !== 'pending'))
const submitLabel = computed(() =>
  hasResult.value ? `重試（${pendingRows.value.length}）` : `確認登記（${rows.value.length} 筆）`,
)

function close() {
  emit('update:modelValue', false)
}

async function submit() {
  const targets = pendingRows.value
  if (targets.length === 0) return
  submitting.value = true
  try {
    const payload: ApiBody<'/fees/records/batch-pay', 'post'> = {
      items: targets.map((r) => ({ record_id: r.record_id, idempotency_key: r.idempotency_key })),
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      notes: form.notes,
    }
    const resp = await batchPayFeeRecords(payload)
    resp.results.forEach((result, idx) => {
      const target = targets[idx]
      if (!target || target.record_id !== result.record_id) return
      const row = rows.value.find((r) => r.record_id === result.record_id)
      if (!row) return
      row.status = result.ok ? 'success' : 'error'
      row.error = result.error ?? null
    })
    // 有成功筆就通知父層重新載入清單（即使還有失敗筆殘留在對話框內待重試）。
    emit('paid')
    if (resp.failed === 0) {
      ElMessage.success(`批次登記繳費成功：${resp.succeeded} 筆`)
      emit('update:modelValue', false)
    } else if (resp.succeeded > 0) {
      ElMessage.warning(`成功 ${resp.succeeded} 筆，失敗 ${resp.failed} 筆，請確認後重試`)
    } else {
      ElMessage.error(`批次登記繳費失敗：${resp.failed} 筆`)
    }
  } catch (e: unknown) {
    ElMessage.error(friendlyError('批次登記繳費失敗', e))
  } finally {
    submitting.value = false
  }
}

defineExpose({ form, rows, pendingRows, totalDue, submit })
</script>

<style scoped>
.cash-handover-hint {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-xs);
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.batch-pay-summary {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-color);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.batch-pay-summary__amount {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.batch-pay-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.batch-pay-row {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-md);
}

.batch-pay-row--success {
  border-color: var(--color-success);
  background: var(--color-success-soft);
}

.batch-pay-row--error {
  border-color: var(--color-danger);
}

.batch-pay-row__main {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-3);
}

.batch-pay-row__name {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.batch-pay-row__amount {
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.batch-pay-row__meta {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.batch-pay-row__status {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
}

.batch-pay-row__status--success {
  color: var(--color-success-darker);
}

.batch-pay-row__status--error {
  color: var(--color-danger-darker);
}
</style>
