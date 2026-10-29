<script setup lang="ts">
/**
 * 後台「修改密碼」共用表單：強制改密頁（ChangePasswordView）與個人資料頁（AdminProfileView）共用。
 *
 * 單一事實來源：欄位、驗證規則、即時規則清單、錯誤訊息、送出防連點都只在這裡；
 * 兩個入口只決定「成功之後要去哪裡」（emit success 由父層處理）。
 * 密碼規則以 `@/utils/passwordRules`（對齊後端 validate_password_strength）為準，這裡不自創規則。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance } from 'element-plus'
import { Check, Minus } from '@element-plus/icons-vue'
import { changePassword } from '@/api/auth'
import { apiError } from '@/utils/error'
import {
  evaluatePasswordRules,
  PASSWORD_SERVER_ONLY_HINT,
  validatePasswordStrength,
} from '@/utils/passwordRules'

const props = withDefaults(defineProps<{
  size?: 'default' | 'large'
  submitText?: string
  autofocus?: boolean
}>(), {
  size: 'default',
  submitText: '更新密碼',
  autofocus: false,
})

const emit = defineEmits<{ success: [] }>()

// 送出中狀態可由父層 v-model:submitting 讀取（例如強制改密頁送出時停用「登出」）；未綁定時為本地狀態。
const submitting = defineModel<boolean>('submitting', { default: false })

const DEFAULT_ERROR_MESSAGE = '密碼更新失敗，請稍後再試'
const MISMATCH_MESSAGE = '兩次輸入的密碼不一致'

const formRef = ref<FormInstance | null>(null)
const oldPasswordInput = ref<{ focus?: () => void } | null>(null)
const newPasswordInput = ref<{ focus?: () => void } | null>(null)
const confirmPasswordInput = ref<{ focus?: () => void } | null>(null)
const submitError = ref('')
const confirmBlurred = ref(false)

const form = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

const ruleStates = computed(() => evaluatePasswordRules(form.new_password))
const isConfirmMatched = computed(() => form.confirm_password === form.new_password)
// 不依賴 el-form 的後備判斷：el-form 的 validate() 在單元測試環境恆回 true，
// 也避免日後 rules 被改漏時，不合規的密碼直接打到後端。
const isFormValid = computed(
  () =>
    form.old_password !== '' &&
    ruleStates.value.every((rule) => rule.ok) &&
    form.confirm_password !== '' &&
    isConfirmMatched.value,
)

// 確認密碼的即時比對（元件自己算，不靠 el-form 規則，這樣畫面行為與單元測試一致）。
// 還在打字、輸入內容仍是新密碼的前段時不吵人；一旦打歪、超長，或離開欄位仍不一致就立刻提示。
const confirmMismatchMessage = computed(() => {
  const confirm = form.confirm_password
  if (confirm === '' || isConfirmMatched.value) return ''
  const stillTyping = form.new_password.startsWith(confirm) && !confirmBlurred.value
  return stillTyping ? '' : MISMATCH_MESSAGE
})

const rules = {
  old_password: [{ required: true, message: '請輸入目前密碼', trigger: 'blur' }],
  new_password: [
    { required: true, message: '請輸入新密碼', trigger: 'blur' },
    { validator: validatePasswordStrength, trigger: 'blur' },
  ],
  confirm_password: [
    // 「不一致」由 confirmMismatchMessage 即時處理，這裡只管沒填
    { required: true, message: '請再次輸入新密碼', trigger: 'blur' },
  ],
}

// 使用者開始修改輸入就收掉上一次的送出錯誤，避免錯誤訊息黏在畫面上誤導
watch(form, () => {
  submitError.value = ''
})

// 後端訊息用「舊密碼」，畫面欄位叫「目前密碼」，統一成同一個詞。
const friendlyError = (error: unknown) =>
  apiError(error, DEFAULT_ERROR_MESSAGE).replace('舊密碼', '目前密碼')

const resetForm = async () => {
  form.old_password = ''
  form.new_password = ''
  form.confirm_password = ''
  confirmBlurred.value = false
  await nextTick()
  formRef.value?.clearValidate()
  submitError.value = ''
}

// 閘門擋下時，把游標帶到第一個有問題的欄位
const focusFirstProblem = () => {
  if (form.old_password === '') oldPasswordInput.value?.focus?.()
  else if (!ruleStates.value.every((rule) => rule.ok)) newPasswordInput.value?.focus?.()
  else confirmPasswordInput.value?.focus?.()
}

const handleSubmit = async () => {
  if (submitting.value) return
  submitError.value = ''
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  if (!isFormValid.value) {
    focusFirstProblem()
    return
  }

  submitting.value = true
  // API 失敗與「成功後的收尾」分開處理：收尾若出狀況，不能被誤報成「密碼更新失敗」。
  let changed = false
  try {
    await changePassword({
      old_password: form.old_password,
      new_password: form.new_password,
    })
    changed = true
  } catch (error) {
    submitError.value = friendlyError(error)
  }
  try {
    if (changed) {
      await resetForm()
      emit('success')
    }
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  if (props.autofocus) {
    nextTick(() => oldPasswordInput.value?.focus?.())
  }
})
</script>

<template>
  <el-form
    ref="formRef"
    class="password-change-form"
    :model="form"
    :rules="rules"
    :size="size"
    label-position="top"
    @submit.prevent="handleSubmit"
  >
    <el-form-item label="目前密碼" prop="old_password">
      <el-input
        ref="oldPasswordInput"
        v-model="form.old_password"
        type="password"
        placeholder="請輸入目前使用的密碼"
        autocomplete="current-password"
        show-password
      />
    </el-form-item>

    <el-form-item label="新密碼" prop="new_password">
      <el-input
        ref="newPasswordInput"
        v-model="form.new_password"
        type="password"
        placeholder="請輸入符合規則的新密碼"
        autocomplete="new-password"
        show-password
      />
    </el-form-item>

    <!-- 即時規則清單：邊輸入邊打勾，取代只在送出後才看到的紅字 -->
    <div class="pcf-rules" data-test="password-rules">
      <div class="pcf-rules__title">新密碼需符合</div>
      <ul class="pcf-rules__list">
        <li
          v-for="rule in ruleStates"
          :key="rule.label"
          class="pcf-rules__item"
          :class="{ 'is-met': rule.ok }"
          :data-met="rule.ok ? 'true' : 'false'"
        >
          <el-icon class="pcf-rules__icon" aria-hidden="true">
            <Check v-if="rule.ok" />
            <Minus v-else />
          </el-icon>
          <span>{{ rule.label }}</span>
          <span class="pcf-sr-only">{{ rule.ok ? '（已符合）' : '（尚未符合）' }}</span>
        </li>
      </ul>
      <p class="pcf-rules__hint">{{ PASSWORD_SERVER_ONLY_HINT }}</p>
    </div>

    <el-form-item label="確認新密碼" prop="confirm_password" :error="confirmMismatchMessage">
      <el-input
        ref="confirmPasswordInput"
        v-model="form.confirm_password"
        type="password"
        placeholder="再次輸入新密碼"
        autocomplete="new-password"
        show-password
        @blur="confirmBlurred = true"
      />
    </el-form-item>

    <el-alert
      v-if="submitError"
      class="pcf-error"
      data-test="password-submit-error"
      type="error"
      show-icon
      :closable="false"
      :title="submitError"
      role="alert"
    />

    <el-button
      class="pcf-submit"
      type="primary"
      native-type="submit"
      :loading="submitting"
    >
      {{ submitting ? '更新中…' : submitText }}
    </el-button>
  </el-form>
</template>

<style scoped>
.pcf-rules {
  margin: 0 0 var(--space-4);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: var(--bg-color-soft, var(--bg-color));
  border: 1px solid var(--border-color-lighter, var(--border-color));
}

.pcf-rules__title {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.pcf-rules__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pcf-rules__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.pcf-rules__item.is-met {
  color: var(--color-success-darker, var(--color-success));
}

.pcf-rules__icon {
  flex-shrink: 0;
}

.pcf-rules__hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.pcf-error {
  margin-bottom: var(--space-3);
}

.pcf-submit {
  width: 100%;
  margin-top: var(--space-1);
}

.pcf-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
