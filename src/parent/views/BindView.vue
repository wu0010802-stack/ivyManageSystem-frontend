<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AxiosError } from 'axios'
import { bind } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'
import BrandMark from '@/components/brand/BrandMark.vue'

const route = useRoute()
const router = useRouter()
const authStore = useParentAuthStore()

const code = ref('')
const submitting = ref(false)
const errorMessage = ref('')
// 後端 BusinessError code：BIND_CODE_NOT_FOUND / EXPIRED / USED；其他失敗為空字串
const errorCode = ref('')

const nameHint = computed(() => String(route.query.name_hint || ''))
const trimmedCode = computed(() => code.value.trim().toUpperCase())
// EXPIRED / USED 才需要「聯絡園所索取新碼」CTA；NOT_FOUND 只需提示重新輸入
const needsNewCode = computed(
  () => errorCode.value === 'BIND_CODE_EXPIRED' || errorCode.value === 'BIND_CODE_USED',
)
const schoolPhone = (import.meta.env.VITE_SCHOOL_PHONE as string | undefined) || ''

async function submit() {
  errorMessage.value = ''
  errorCode.value = ''
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
  } catch (err: unknown) {
    const e = err as AxiosError
    const detail = e?.errorDetail as { code?: string } | null | undefined
    errorCode.value = String(detail?.code || '')
    errorMessage.value = String(e?.displayMessage || '綁定碼無效或已過期')
  } finally {
    submitting.value = false
  }
}

function resetForRetry() {
  code.value = ''
  errorMessage.value = ''
  errorCode.value = ''
}
</script>

<template>
  <div class="bind-view">
    <BrandMark variant="full" :size="100" class="welcome-mark" />
    <div class="bind-card">
      <p class="welcome-eyebrow">第一次使用</p>
      <h1 class="title">完成家長帳號綁定</h1>
      <p v-if="nameHint" class="hint-name">您好，{{ nameHint }}</p>
      <p id="bind-code-desc" class="desc">
        請輸入園所提供的「家長綁定碼」（8 位英數字）。<br>
        碼僅為一次性使用，如過期或已用過，請聯絡園所重新發放。
      </p>

      <div class="input-group">
        <label for="bind-code" class="sr-only">家長綁定碼</label>
        <input
          id="bind-code"
          v-model="code"
          type="text"
          :inputmode="('latin' as any)"
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
        <span class="material-symbols-rounded" aria-hidden="true">error</span>
        {{ errorMessage }}
      </p>

      <div v-if="needsNewCode" class="recovery-actions">
        <a
          v-if="schoolPhone"
          :href="`tel:${schoolPhone}`"
          class="pt-action-btn recovery-call"
        >
          <span class="material-symbols-rounded" aria-hidden="true">call</span>
          聯絡園所 {{ schoolPhone }}
        </a>
        <button
          type="button"
          class="pt-action-btn recovery-retry"
          @click="resetForRetry"
        >
          <span class="material-symbols-rounded" aria-hidden="true">restart_alt</span>
          我已重新拿碼
        </button>
      </div>

      <button
        class="pt-action-btn submit"
        type="button"
        :disabled="submitting"
        @click="submit"
      >
        <span class="material-symbols-rounded" aria-hidden="true">link</span>
        {{ submitting ? '綁定中…' : '送出綁定' }}
      </button>
    </div>

    <p class="legal">需要協助？請聯絡園所行政人員</p>
  </div>
</template>

<style scoped>
.bind-view {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(ellipse at 50% 20%, rgba(13, 144, 83, 0.06), transparent 60%),
    linear-gradient(180deg, var(--cream, #fffcf2) 0%, var(--leaf-100, #dcf4e6) 100%);
}

.welcome-mark {
  margin: 24px auto 16px;
  display: block;
}

.bind-card {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 24px;
  padding: 28px 24px;
  width: 100%;
  max-width: 380px;
  border: 1px solid rgba(13, 144, 83, 0.12);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 8px 24px rgba(13, 144, 83, 0.08),
    0 24px 56px rgba(13, 144, 83, 0.10);
}

.welcome-eyebrow {
  margin: 0;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--pt-text-muted);
  text-transform: uppercase;
}

.title {
  margin: 4px 0 8px;
  text-align: center;
  font-size: 22px;
  font-weight: 800;
  color: var(--pt-text-strong);
  letter-spacing: -0.01em;
}

.hint-name {
  margin: 0 0 12px;
  text-align: center;
  font-size: 14px;
  color: var(--brand-primary, #0d9053);
  font-weight: 600;
}

.desc {
  color: var(--pt-text-body);
  font-size: 13px;
  line-height: 1.65;
  margin: 8px 0 18px;
  text-align: center;
}

.input-group input {
  width: 100%;
  min-height: 56px;
  padding: 12px 14px;
  font-size: 22px;
  letter-spacing: 6px;
  text-align: center;
  border: 2px solid var(--pt-border-light, #ecf5f9);
  border-radius: 14px;
  font-family: ui-monospace, 'SF Mono', 'Menlo', monospace;
  text-transform: uppercase;
  background: var(--cream, #fffcf2);
  font-weight: 700;
  color: var(--pt-text-strong);
  box-sizing: border-box;
}

.input-group input:focus-visible {
  outline: none;
  border-color: var(--brand-primary, #0d9053);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(13, 144, 83, 0.12);
}

.error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--coral-700, #b14545);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 10px 12px;
  background: var(--coral-100, #ffe3e0);
  border-radius: 10px;
  font-weight: 500;
}
.error .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}

.recovery-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.recovery-call,
.recovery-retry {
  width: 100%;
  min-height: 44px;
  font-size: 14px;
  background: rgba(13, 144, 83, 0.08);
  color: var(--brand-primary, #0d9053);
  border: 1px solid rgba(13, 144, 83, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-decoration: none;
  border-radius: 12px;
}
.recovery-retry {
  background: transparent;
}

.submit {
  margin-top: 16px;
  width: 100%;
  min-height: 52px;
  font-size: 16px;
}

.legal {
  margin: 24px 0 0;
  font-size: 11px;
  color: var(--pt-text-faint);
  text-align: center;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
</style>
