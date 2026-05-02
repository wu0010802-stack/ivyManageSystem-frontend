<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { bind } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'

const route = useRoute()
const router = useRouter()
const authStore = useParentAuthStore()

const code = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const nameHint = computed(() => route.query.name_hint || '')

const trimmedCode = computed(() => code.value.trim().toUpperCase())

async function submit() {
  errorMessage.value = ''
  if (!trimmedCode.value) {
    errorMessage.value = '請輸入綁定碼'
    return
  }
  submitting.value = true
  try {
    const { data } = await bind(trimmedCode.value)
    if (data?.status === 'ok' && data?.user) {
      authStore.setUser(data.user)
      router.replace('/home')
    } else {
      errorMessage.value = '綁定失敗，請聯絡園所'
    }
  } catch (err) {
    errorMessage.value = err?.displayMessage || '綁定碼無效或已過期'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="bind-view">
    <div class="bind-card">
      <h2 class="title">完成家長帳號綁定</h2>
      <p v-if="nameHint" class="hint">您好，{{ nameHint }}</p>
      <p id="bind-code-desc" class="desc">
        請輸入園所提供的「家長綁定碼」（8 位英數字）。
        碼僅為一次性使用，如過期或已用過，請聯絡園所重新發放。
      </p>
      <div class="input-group">
        <label for="bind-code" class="sr-only">家長綁定碼</label>
        <input
          id="bind-code"
          v-model="code"
          type="text"
          inputmode="latin"
          autocapitalize="characters"
          autocomplete="one-time-code"
          placeholder="例：ABCD1234"
          maxlength="20"
          aria-describedby="bind-code-desc"
          @keydown.enter="submit"
        />
      </div>
      <p
        v-if="errorMessage"
        class="error"
        role="alert"
        aria-live="assertive"
      >
        {{ errorMessage }}
      </p>
      <button
        class="submit"
        type="button"
        :disabled="submitting"
        @click="submit"
      >
        {{ submitting ? '綁定中...' : '送出' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bind-view {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, var(--brand-primary) 0%, #5fa46a 100%);
}

.bind-card {
  background: var(--neutral-0);
  border-radius: 16px;
  padding: 28px 22px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.title {
  margin: 0 0 8px;
  font-size: 20px;
  color: var(--brand-primary);
  text-align: center;
}

.hint {
  margin: 0 0 12px;
  color: var(--pt-text-muted);
  text-align: center;
  font-size: 14px;
}

.desc {
  color: var(--pt-text-soft);
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 16px;
}

.input-group input {
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  padding: 12px 14px;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
  border: 1px solid var(--pt-border-strong);
  border-radius: var(--radius-md, 8px);
  font-family: ui-monospace, "Menlo", monospace;
  text-transform: uppercase;
}

.input-group input:focus-visible {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-primary-soft);
}

.error {
  color: var(--color-danger);
  font-size: 14px;
  margin: 12px 0 0;
  text-align: center;
}

.submit {
  margin-top: 16px;
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  padding: 12px;
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 16px;
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: background var(--transition-fast, 0.15s ease);
}

.submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.submit:active:not(:disabled) {
  background: var(--brand-primary-hover);
}
</style>
