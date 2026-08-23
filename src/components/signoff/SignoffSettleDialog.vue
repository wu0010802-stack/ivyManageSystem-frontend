<template>
  <el-dialog
    v-model="visible"
    :title="config.texts.settleAction"
    width="480px"
    :close-on-click-modal="false"
    destroy-on-close
    @close="reset"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent
    >
      <el-form-item :label="config.texts.actualDateLabel" prop="actualDate">
        <el-date-picker
          v-model="form.actualDate"
          type="date"
          value-format="YYYY-MM-DD"
          :placeholder="`現金實際${config.texts.unitLabel}的日期`"
          style="width: 100%"
          :disabled-date="disabledFutureDate"
        />
        <div class="form-hint">
          必須是現金真正發生的日期，不是預計日期（可回補 90 天內）
        </div>
      </el-form-item>
      <el-form-item label="收付方式" prop="paymentMethod">
        <el-select v-model="form.paymentMethod" style="width: 100%">
          <el-option
            v-for="opt in paymentMethodOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="交易參考號（選填）" prop="transactionRef">
        <el-input
          v-model="form.transactionRef"
          maxlength="60"
          placeholder="例：匯款末五碼 12345、收據序號"
        />
        <div class="form-hint">請勿填完整銀行帳號；末五碼或交易序號即可</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        data-test="settle-confirm"
        @click="submit"
      >{{ config.texts.settleAction }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from '@/constants/signoff'
import type { SignoffModuleConfig } from '@/config/signoffModules'
import { extractApiErrorMessage } from '@/utils/financeSignoff'
import { todayISO } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    recordId?: number | null
    config: SignoffModuleConfig
    /** 帶入單據現值當預設收付方式 */
    defaultMethod?: string
  }>(),
  { modelValue: false, recordId: null, defaultMethod: 'cash' },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  settled: []
}>()

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const visible = ref(props.modelValue)
watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
    if (v) {
      form.actualDate = todayISO()
      form.paymentMethod = props.defaultMethod || 'cash'
      form.transactionRef = ''
    }
  },
)
watch(visible, (v) => emit('update:modelValue', v))

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  actualDate: todayISO(),
  paymentMethod: props.defaultMethod || 'cash',
  transactionRef: '',
})

// 禁存完整銀行帳號：去空白/連字號後 10 位以上純數字即擋（與後端守衛一致）
const accountLike = (v: string) => /^\d{10,}$/.test(v.replace(/[\s-]/g, ''))

const rules: FormRules = {
  actualDate: [{ required: true, message: '請選擇實際收付日期', trigger: 'change' }],
  paymentMethod: [{ required: true, message: '請選擇收付方式', trigger: 'change' }],
  transactionRef: [
    {
      validator: (_rule, value: string, callback) => {
        if (value && accountLike(value)) {
          callback(new Error('疑似完整銀行帳號，請改填末五碼或交易序號'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

function disabledFutureDate(time: Date): boolean {
  return time.getTime() > Date.now()
}

function reset() {
  formRef.value?.clearValidate()
}

async function submit() {
  if (!props.recordId) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await props.config.api.settle(props.recordId, {
      actual_date: form.actualDate,
      payment_method: form.paymentMethod as PaymentMethod,
      transaction_ref: form.transactionRef || null,
    })
    ElMessage.success(`已${props.config.texts.settleAction}`)
    emit('settled')
    visible.value = false
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e))
  } finally {
    submitting.value = false
  }
}
</script>
