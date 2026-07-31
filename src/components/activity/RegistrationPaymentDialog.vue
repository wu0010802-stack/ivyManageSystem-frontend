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
      <span :class="summaryState.cls">
        {{ summaryState.label }}
        <strong v-if="paymentDiff !== 0">NT${{ Math.abs(paymentDiff).toLocaleString() }}</strong>
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
      <el-form-item :label="type === 'refund' ? '退費原因＊' : '備註'">
        <el-input
          v-model="form.notes"
          type="textarea"
          :rows="2"
          :placeholder="type === 'refund'
            ? `必填，請說明退費原因（至少 ${FIELD_RULES.refundReasonMin} 字，會寫入退費紀錄供稽核）`
            : ''"
        />
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
        :disabled="!form.amount || !form.payment_date || refundSuggestionLoading"
        @click="handleSubmit"
      >確認送出</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { addRegistrationPayment, getRefundSuggestion } from '@/api/activity'
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
// 退費建議值載入中（按出席比例，避免預填全額已繳超退；P2-B）
const refundSuggestionLoading = ref<boolean>(false)
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

// 抓後端退費建議（按出席堂數三段比例），以 remaining_suggested_amount（剩餘建議額＝
// 建議總額扣已退、夾 0）覆寫全額預填；多次退費不重複預填累積建議總額（audit F1）。
// 仍開著同一筆才套用。
// fail-closed（audit F2）：載入失敗或回應缺 remaining_suggested_amount 時，不再保留全額
// fallback，改歸 0 + 警告，強制人工輸入（form.amount=0 時送出鈕 :disabled 為 true）。
// review P2#2（2026-07-12）：加請求序號守衛。同一筆報名關閉後快速重開會發出兩次載入，
// 較慢的舊請求（可能是退費發生前的過時建議）最後 resolve 時若只比對 modelValue + reg id
// 仍會覆寫較新請求的金額、其 finally 也會提前解鎖。stillCurrent 併驗序號、finally 僅
// 最新請求解鎖。
let refundSuggestionSeq = 0
async function loadRefundSuggestion(registrationId: string | number) {
  const seq = ++refundSuggestionSeq
  refundSuggestionLoading.value = true
  const stillCurrent = () =>
    seq === refundSuggestionSeq &&
    props.modelValue && Number(props.registrationId) === Number(registrationId)
  const failClosed = () => {
    if (!stillCurrent()) return
    form.amount = 0
    ElMessage.warning('退費建議載入失敗，請手動確認退費金額')
  }
  try {
    const res = await getRefundSuggestion(Number(registrationId))
    if (!stillCurrent()) return
    const remaining = (res.data as { remaining_suggested_amount?: number })
      ?.remaining_suggested_amount
    if (typeof remaining === 'number' && Number.isFinite(remaining)) {
      form.amount = remaining
    } else {
      failClosed()
    }
  } catch {
    failClosed()
  } finally {
    if (seq === refundSuggestionSeq) refundSuggestionLoading.value = false
  }
}

// 開窗初始化。必須帶 immediate：父層 ActivityRegistrationView 以
// `v-if="paymentDialogVisible"` 懶掛載，元件建立時 modelValue 已經是 true，之後不再有
// false→true 變化；沒有 immediate 這段永不執行，金額停在 0、日期停在空字串，送出鈕的
// `:disabled="!form.amount || !form.payment_date"` 恆為 true，繳費與退費都送不出去。
// 位置必須排在 loadRefundSuggestion 之後——immediate 會在 setup 期間同步執行 callback，
// 放在前面會踩到 `let refundSuggestionSeq` 的 TDZ。
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    // 退費先放全額已繳作 fallback，再以後端建議值（按出席比例）覆寫，避免超退（P2-B）
    form.amount = props.type === 'payment'
      ? computeOwed(props.totalAmount, props.paidAmount)
      : props.paidAmount
    form.payment_date = todayISO()
    form.payment_method = (PAYMENT_METHODS as string[])[0]
    form.notes = ''
    form.idempotency_key = genIdempotencyKey()
    if (props.type === 'refund' && props.registrationId != null) {
      loadRefundSuggestion(props.registrationId)
    }
  },
  { immediate: true }
)

const overpayment = computed(() => {
  if (props.type !== 'payment') return 0
  return Math.max(0, props.paidAmount + (form.amount || 0) - props.totalAmount)
})

// 付款摘要狀態：超繳 / 已繳清 / 尚欠。補「已繳清」第三態，避免
// paidAmount === totalAmount 時誤顯示「尚欠 NT$0」。
const paymentDiff = computed(() => props.totalAmount - props.paidAmount)
const summaryState = computed(() => {
  if (props.paidAmount > props.totalAmount) return { label: '超繳', cls: 'dps-over' }
  if (props.paidAmount === props.totalAmount) return { label: '已繳清', cls: 'dps-settled' }
  return { label: '尚欠', cls: 'dps-owed' }
})

async function handleSubmit() {
  if (!props.registrationId || saving.value) return
  const amount = Number(form.amount) || 0
  if (amount <= 0) {
    ElMessage.warning('金額必須大於 0')
    return
  }
  if (props.type === 'refund') {
    // 退費金額上限守衛：不可超過已繳（對齊後端與 POS canSubmit 的顯式守衛）。
    // el-input-number 的 :max 為軟 clamp，貼上／程式化輸入可短暫超出，故顯式攔。
    if (amount > props.paidAmount) {
      ElMessage.warning(`退費金額不可超過已繳 NT$${props.paidAmount.toLocaleString()}`)
      return
    }
    // 後端 AddPaymentRequest 對 type=refund 強制 notes（退費原因）≥
    // MIN_REFUND_REASON_LENGTH=15；前端先擋，避免送出後才被 422。
    const reason = (form.notes || '').trim()
    if (reason.length < FIELD_RULES.refundReasonMin) {
      ElMessage.warning(`退費原因必須至少 ${FIELD_RULES.refundReasonMin} 字`)
      return
    }
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
.dps-settled { color: var(--color-success-hover); }
.dps-over { color: var(--color-warning-hover); }
</style>
