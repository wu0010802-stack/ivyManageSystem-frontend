<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :title="type === 'payment' ? '新增繳費記錄' : '新增退費記錄'"
    width="400px"
  >
    <div class="dialog-payment-summary">
      <span>應繳 <strong>NT${{ totalAmount.toLocaleString() }}</strong></span>
      <span class="dps-divider">|</span>
      <span>已繳 <strong class="dps-paid">NT${{ paidAmount.toLocaleString() }}</strong></span>
      <span class="dps-divider">|</span>
      <span :class="paidAmount > totalAmount ? 'dps-over' : 'dps-owed'">
        {{ paidAmount > totalAmount ? '超繳' : '尚欠' }}
        <strong>NT${{ Math.abs(totalAmount - paidAmount).toLocaleString() }}</strong>
      </span>
    </div>
    <el-form :model="form" label-width="90px">
      <el-form-item label="金額（元）">
        <el-input-number
          v-model="form.amount"
          :min="1"
          :max="type === 'refund' ? paidAmount : FIELD_RULES.paymentAmountMax"
          :step="1"
          :precision="0"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker
          v-model="form.payment_date"
          type="date"
          placeholder="選擇日期"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="繳費方式">
        <el-select v-model="form.payment_method" style="width: 100%">
          <el-option v-for="m in PAYMENT_METHODS" :key="m" :label="m" :value="m" />
        </el-select>
      </el-form-item>
      <el-form-item label="備註">
        <el-input v-model="form.notes" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <el-alert
      v-if="overpayment > 0"
      :title="`送出後將超繳 NT$${overpayment.toLocaleString()} 元，請確認`"
      type="warning"
      :closable="false"
      style="margin-top: 4px"
    />
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        :type="type === 'payment' ? 'success' : 'danger'"
        :loading="saving"
        :disabled="!form.amount || !form.payment_date"
        @click="handleSubmit"
      >確認送出</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { addRegistrationPayment } from '@/api/activity'
import { computeOwed } from '@/constants/pos'
import { FIELD_RULES, PAYMENT_METHODS } from '@/constants/activity'
import { todayISO } from '@/utils/format'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  type?: string
  registrationId?: string | number | null
  studentName?: string
  totalAmount?: number
  paidAmount?: number
}>(), {
  modelValue: false,
  type: 'payment',
  registrationId: null,
  studentName: '',
  totalAmount: 0,
  paidAmount: 0,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'submitted': []
}>()

const saving = ref<boolean>(false)
const form = reactive<{
  amount: number
  payment_date: string
  payment_method: string
  notes: string
  idempotency_key: string
}>({
  amount: 0,
  payment_date: '',
  payment_method: (PAYMENT_METHODS as string[])[0],
  notes: '',
  idempotency_key: '',
})

// 後端要求 ^[A-Za-z0-9_-]{8,64}$；同一筆失敗重送會去重，避免重複扣款
function genIdempotencyKey() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `REG-${Date.now()}-${rand}`
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    form.amount = props.type === 'payment'
      ? computeOwed(props.totalAmount, props.paidAmount)
      : props.paidAmount
    form.payment_date = todayISO()
    form.payment_method = (PAYMENT_METHODS as string[])[0]
    form.notes = ''
    form.idempotency_key = genIdempotencyKey()
  }
)

const overpayment = computed(() => {
  if (props.type !== 'payment') return 0
  return Math.max(0, props.paidAmount + (form.amount || 0) - props.totalAmount)
})

async function handleSubmit() {
  if (!props.registrationId || saving.value) return
  const amount = Number(form.amount) || 0
  if (amount <= 0) {
    ElMessage.warning('金額必須大於 0')
    return
  }
  if (props.type === 'refund') {
    try {
      await ElMessageBox.confirm(
        `確定要為 ${props.studentName || '此報名'} 退費 NT$${amount.toLocaleString()}？此操作會同步更新已繳金額。`,
        '確認退費',
        {
          type: 'warning',
          confirmButtonText: '確定退費',
          confirmButtonClass: 'el-button--danger',
          cancelButtonText: '取消',
        }
      )
    } catch {
      return
    }
  }
  saving.value = true
  try {
    await addRegistrationPayment(props.registrationId as number, {
      // type / payment_method 後端為 Literal（POS cash-only）；表單值為 string，
      // 由 UI 約束在合法集合內，此處 cast 對齊 codegen 契約。
      type: props.type as 'payment' | 'refund',
      amount,
      payment_date: form.payment_date,
      payment_method: form.payment_method as '現金',
      notes: form.notes.trim(),
      idempotency_key: form.idempotency_key,
    })
    ElMessage.success(`${props.type === 'payment' ? '繳費' : '退費'}記錄新增成功`)
    emit('update:modelValue', false)
    emit('submitted')
  } catch (e) {
    const axiosErr = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(axiosErr?.response?.data?.detail || '新增失敗')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.dialog-payment-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-color);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--neutral-700);
  flex-wrap: wrap;
}
.dps-divider { color: var(--neutral-300); }
.dps-paid { color: var(--color-success-hover); }
.dps-owed { color: var(--neutral-700); }
.dps-over { color: var(--color-warning-hover); }
</style>
