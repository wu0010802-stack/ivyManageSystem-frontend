<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="退費"
    width="640"
  >
    <div v-if="record" class="record-info">
      <p><b>學生</b>:{{ record.student_name }}</p>
      <p><b>項目</b>:{{ record.fee_item_name }}</p>
      <p><b>類型</b>:{{ feeTypeLabel }} ·
        <b>應繳</b>:NT$ {{ record.amount_due?.toLocaleString() }} ·
        <b>已繳</b>:NT$ {{ record.amount_paid?.toLocaleString() }}</p>
    </div>

    <el-alert
      v-if="isBlocked"
      type="error"
      :title="`${feeTypeLabel}依規定不予退費`"
      :closable="false"
      show-icon
    />

    <el-form v-if="!isBlocked" :model="form" label-width="100" class="mt-12">
      <el-form-item label="離園日期">
        <el-date-picker v-model="form.withdrawal_date" type="date" />
        <el-button type="primary" plain :loading="suggesting" :disabled="!form.withdrawal_date" @click="onSuggest" class="ml-8">
          自動計算建議
        </el-button>
      </el-form-item>

      <template v-if="form.fee_type === 'registration' || form.fee_type === 'miscellaneous'">
        <el-form-item label="教保總日數">
          <el-input-number v-model="form.T_total_override" :min="1" :max="400" placeholder="自動推算" />
          <span class="hint">不填則由系統依國定假日推算</span>
        </el-form-item>
        <el-form-item label="已服務日數">
          <el-input-number v-model="form.T_served_override" :min="0" :max="400" placeholder="自動推算" />
        </el-form-item>
      </template>

      <el-alert v-if="suggestion" :type="suggestion.suggested_amount > 0 ? 'success' : 'info'" :closable="false" class="mt-12">
        <p><b>建議退費金額:</b> NT$ {{ suggestion.suggested_amount.toLocaleString() }}</p>
        <p class="formula">{{ suggestion.calc_payload?.formula }}</p>
        <ul v-if="suggestion.warnings?.length" class="warnings">
          <li v-for="w in suggestion.warnings" :key="w">{{ w }}</li>
        </ul>
      </el-alert>

      <el-form-item label="退費金額" class="mt-12">
        <el-input-number v-model="form.amount" :min="1" :max="record?.amount_paid || 999999" />
        <el-button v-if="suggestion" link @click="applySuggested">套用建議</el-button>
      </el-form-item>
      <el-form-item label="退費原因">
        <el-input v-model="form.reason" placeholder="至少 5 個字" />
      </el-form-item>
      <el-form-item label="備註">
        <el-input v-model="form.notes" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="danger"
        :disabled="isBlocked || !canSubmit"
        :loading="submitting"
        @click="onSubmit"
      >
        確認退費
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { suggestRefund, refundFeeRecord } from '@/api/fees'
import { NON_REFUNDABLE_FEE_TYPES } from './feeTypes'

interface FeeRecord {
  id: number
  student_name?: string
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

async function onSubmit() {
  submitting.value = true
  try {
    await refundFeeRecord((props.record as FeeRecord).id, {
      amount: form.amount,
      reason: form.reason,
      notes: form.notes,
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
  return dt.toISOString().slice(0, 10)
}
</script>

<style scoped>
.record-info p { margin: 4px 0; color: #555; }
.formula { color: #888; font-size: 12px; margin-top: 4px; font-family: monospace; }
.warnings { margin: 6px 0 0 20px; color: #d33; font-size: 13px; }
.mt-12 { margin-top: 12px; }
.ml-8 { margin-left: 8px; }
.hint { color: #888; margin-left: 8px; font-size: 12px; }
</style>
