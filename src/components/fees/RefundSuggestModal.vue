<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="退費"
    width="640"
  >
    <dl v-if="record" class="refund-context" data-test="refund-context">
      <div class="refund-context__row">
        <dt>學生</dt>
        <dd>{{ record.student_name }}<template v-if="record.classroom_name">（{{ record.classroom_name }}）</template></dd>
      </div>
      <div v-if="record.period" class="refund-context__row">
        <dt>期別</dt>
        <dd>{{ record.period }}</dd>
      </div>
      <div class="refund-context__row">
        <dt>費用項目</dt>
        <dd>{{ record.fee_item_name }}（{{ feeTypeLabel }}）</dd>
      </div>
      <div class="refund-context__row">
        <dt>應繳</dt>
        <dd class="refund-context__num">{{ formatCurrency(record.amount_due ?? 0) }}</dd>
      </div>
      <div class="refund-context__row">
        <dt>已繳</dt>
        <dd class="refund-context__num">{{ formatCurrency(record.amount_paid ?? 0) }}</dd>
      </div>
    </dl>

    <el-alert
      v-if="isBlocked"
      type="error"
      :title="`${feeTypeLabel}依規定不予退費`"
      :closable="false"
      show-icon
    />

    <!-- 編輯階段 -->
    <el-form v-if="!isBlocked && !reviewing" :model="form" label-width="100" class="mt-12">
      <el-form-item label="離園日期">
        <el-date-picker v-model="form.withdrawal_date" type="date" aria-label="離園日期" />
        <el-button type="primary" plain :loading="suggesting" :disabled="!form.withdrawal_date" @click="onSuggest" class="ml-8">
          自動計算建議
        </el-button>
      </el-form-item>

      <template v-if="form.fee_type === 'registration' || form.fee_type === 'miscellaneous'">
        <el-form-item label="教保總日數">
          <el-input-number v-model="form.T_total_override" :min="1" :max="400" placeholder="自動推算" aria-label="教保總日數" />
          <span class="hint">不填則由系統依國定假日推算</span>
        </el-form-item>
        <el-form-item label="已服務日數">
          <el-input-number v-model="form.T_served_override" :min="0" :max="400" placeholder="自動推算" aria-label="已服務日數" />
        </el-form-item>
      </template>

      <el-alert v-if="suggestion" :type="suggestion.suggested_amount > 0 ? 'success' : 'info'" :closable="false" class="mt-12">
        <p><b>建議退費金額：</b>{{ formatCurrency(suggestion.suggested_amount) }}</p>
        <p class="formula">{{ suggestion.calc_payload?.formula }}</p>
        <ul v-if="suggestion.warnings?.length" class="warnings">
          <li v-for="w in suggestion.warnings" :key="w">{{ w }}</li>
        </ul>
      </el-alert>

      <el-form-item label="退費金額" class="mt-12">
        <el-input-number v-model="form.amount" :min="1" :max="record?.amount_paid || 999999" aria-label="退費金額" />
        <el-button v-if="suggestion" link @click="applySuggested">套用建議</el-button>
      </el-form-item>
      <el-form-item label="退費原因">
        <el-input v-model="form.reason" placeholder="至少 5 個字" aria-label="退費原因" />
      </el-form-item>
      <el-form-item label="備註">
        <el-input v-model="form.notes" type="textarea" :rows="2" aria-label="備註" />
      </el-form-item>
    </el-form>

    <!-- review 階段：確認前重述本次退費內容（同一 dialog，不另開 generic confirm） -->
    <div v-if="!isBlocked && reviewing" class="refund-review" data-test="refund-review">
      <p class="refund-review__lead">請確認以下退費內容，確認後將立即建立退費：</p>
      <dl class="refund-review__list">
        <div class="refund-review__row">
          <dt>本次退費金額</dt>
          <dd class="refund-review__amount">{{ formatCurrency(form.amount) }}</dd>
        </div>
        <div class="refund-review__row">
          <dt>退費原因</dt>
          <dd>{{ form.reason }}</dd>
        </div>
        <div v-if="form.notes" class="refund-review__row">
          <dt>備註</dt>
          <dd>{{ form.notes }}</dd>
        </div>
        <div v-if="suggestion" class="refund-review__row">
          <dt>建議金額</dt>
          <dd class="refund-context__num">{{ formatCurrency(suggestion.suggested_amount) }}（{{ form.amount === suggestion.suggested_amount ? '已採用' : '未採用' }}）</dd>
        </div>
      </dl>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button v-if="reviewing" @click="backToEdit">返回修改</el-button>
      <el-button
        type="danger"
        :disabled="isBlocked || !canSubmit"
        :loading="submitting"
        @click="onFooterConfirm"
      >
        {{ reviewing ? `確認退費 NT$${(form.amount || 0).toLocaleString()}` : '確認退費' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { suggestRefund, refundFeeRecord } from '@/api/fees'
import { NON_REFUNDABLE_FEE_TYPES } from './feeTypes'
import { dateToLocalISO } from '@/utils/format'
import { formatCurrency } from '@/utils/currency'

interface FeeRecord {
  id: number
  student_name?: string
  classroom_name?: string
  period?: string
  fee_item_name?: string
  fee_type?: string
  amount_due?: number
  amount_paid?: number
}

interface RefundSuggestion {
  suggested_amount: number
  calc_method?: string
  calc_payload?: { formula?: string }
  warnings?: string[]
}

const props = defineProps<{
  modelValue: boolean
  record?: FeeRecord | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  refunded: []
}>()

const FEE_TYPE_LABELS = {
  registration: '註冊費', miscellaneous: '雜費', monthly: '月費',
  material: '代購品', insurance: '保險費', custom: '其他',
}

const feeTypeLabel = computed(() => (FEE_TYPE_LABELS as Record<string, string>)[props.record?.fee_type ?? ''] || '其他')
const isBlocked = computed(() => (NON_REFUNDABLE_FEE_TYPES as readonly string[]).includes(props.record?.fee_type ?? ''))

const suggestion = ref<RefundSuggestion | null>(null)
const suggesting = ref<boolean>(false)
const submitting = ref<boolean>(false)
// review state：第一按重述內容、第二按才真正送出（同一 dialog 內，不另疊 confirm modal）
const reviewing = ref<boolean>(false)

// 冪等鍵：同一次退費嘗試固定一把 key，網路逾時/回應遺失後重按沿用同 key，後端 10 分鐘
// 視窗內視為重試回放原結果，避免重複退款（雙重退錢）。後端要求 ^[A-Za-z0-9_-]{8,64}$。
const idempotencyKey = ref<string>('')
function genIdempotencyKey(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `RFD-${Date.now()}-${rand}`
}

const form = reactive<{
  withdrawal_date: Date | null
  T_total_override: number | null
  T_served_override: number | null
  fee_type: string | null
  amount: number
  reason: string
  notes: string
}>({
  withdrawal_date: null,
  T_total_override: null,
  T_served_override: null,
  fee_type: null,
  amount: 0,
  reason: '',
  notes: '',
})

watch(() => props.record, (r) => {
  if (r) {
    form.fee_type = r.fee_type ?? null
    form.amount = 0
    form.reason = ''
    form.notes = ''
    suggestion.value = null
    reviewing.value = false
  }
}, { immediate: true })

// 每次開啟視為一次新的退費嘗試 → 產一把新 key；同一開啟期間（含送出失敗後重按）
// 不重生，確保重送沿用同 key 讓後端回放而非重複退款。
watch(() => props.modelValue, (open) => {
  if (open) {
    idempotencyKey.value = genIdempotencyKey()
    reviewing.value = false
  }
}, { immediate: true })

const canSubmit = computed(() =>
  form.amount > 0 && form.reason?.length >= 5 && !isBlocked.value
)

async function onSuggest() {
  suggesting.value = true
  try {
    const payload: Record<string, unknown> = { withdrawal_date: format(form.withdrawal_date) }
    if (form.T_total_override) payload.T_total_override = form.T_total_override
    if (form.T_served_override) payload.T_served_override = form.T_served_override
    suggestion.value = await suggestRefund((props.record as FeeRecord).id, payload) as RefundSuggestion
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '計算失敗')
  } finally {
    suggesting.value = false
  }
}

function applySuggested() {
  if (suggestion.value) form.amount = suggestion.value.suggested_amount
}

// footer 主鈕：未 review → 進 review；已 review → 真正送出（payload 與冪等鍵沿用既有機制）
function onFooterConfirm(): Promise<void> | void {
  if (!canSubmit.value) return
  if (!reviewing.value) {
    reviewing.value = true
    return
  }
  return onSubmit()
}

function backToEdit() {
  reviewing.value = false
}

async function onSubmit() {
  submitting.value = true
  try {
    await refundFeeRecord((props.record as FeeRecord).id, {
      amount: form.amount,
      reason: form.reason,
      notes: form.notes,
      idempotency_key: idempotencyKey.value,
      calc_method: suggestion.value?.calc_method,
      calc_payload: suggestion.value?.calc_payload,
    })
    ElMessage.success('已建立退費')
    emit('refunded')
    emit('update:modelValue', false)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '退費失敗')
  } finally {
    submitting.value = false
  }
}

function format(d: Date | string | null): string | null {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  // 本地時區，不可用 toISOString()（UTC 會在台北凌晨偏成昨天）；無效日期回 null
  return dateToLocalISO(dt) || null
}

// 供測試檢視內部狀態（比照 AdjustmentEditDialog）
defineExpose({ form, onSubmit, onFooterConfirm, backToEdit, reviewing, idempotencyKey })
</script>

<style scoped>
.refund-context {
  margin: 0 0 var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--bg-color);
}
.refund-context__row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 2px 0;
}
.refund-context__row dt {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  white-space: nowrap;
}
.refund-context__row dd {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
  text-align: right;
}
.refund-context__num {
  font-variant-numeric: tabular-nums;
}

.refund-review__lead {
  margin: var(--space-2) 0 var(--space-3);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
.refund-review__list {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-md);
}
.refund-review__row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 2px 0;
}
.refund-review__row dt {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  white-space: nowrap;
}
.refund-review__row dd {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
  text-align: right;
}
.refund-review__amount {
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.formula {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  margin-top: var(--space-1);
  font-family: monospace;
}
.warnings {
  margin: 6px 0 0 20px;
  color: var(--color-danger-darker);
  font-size: var(--text-sm);
}
.mt-12 { margin-top: var(--space-3); }
.ml-8 { margin-left: var(--space-2); }
.hint {
  color: var(--text-secondary);
  margin-left: var(--space-2);
  font-size: var(--text-xs);
}
</style>
