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
      <p class="desc">
        請輸入園所提供的「家長綁定碼」（8 位英數字）。
        碼僅為一次性使用，如過期或已用過，請聯絡園所重新發放。
      </p>
      <div class="input-group">
        <input
          v-model="code"
          type="text"
          inputmode="latin"
          autocapitalize="characters"
          placeholder="例：ABCD1234"
          maxlength="20"
          @keydown.enter="submit"
        />
      </div>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <button class="submit" :disabled="submitting" @click="submit">
        {{ submitting ? '綁定中...' : '送出' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bind-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #3f7d48 0%, #5fa46a 100%);
}

.bind-card {
  background: #fff;
  border-radius: 16px;
  padding: 28px 22px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.title {
  margin: 0 0 8px;
  font-size: 20px;
  color: #3f7d48;
  text-align: center;
}

.hint {
  margin: 0 0 12px;
  color: #555;
  text-align: center;
  font-size: 14px;
}

.desc {
  color: #666;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 16px;
}

.input-group input {
  width: 100%;
  padding: 12px 14px;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  font-family: ui-monospace, "Menlo", monospace;
  text-transform: uppercase;
}

.input-group input:focus {
  outline: none;
  border-color: #3f7d48;
}

.error {
  color: #c0392b;
  font-size: 14px;
  margin: 12px 0 0;
  text-align: center;
}

.submit {
  margin-top: 16px;
  width: 100%;
  padding: 12px;
  background: #3f7d48;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}

.submit:disabled {
  opacity: 0.6;
}

.submit:active:not(:disabled) {
  background: #336440;
}
</style>
