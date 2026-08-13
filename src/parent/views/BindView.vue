<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AxiosError } from 'axios'
import { bind } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'
import { useFriendlyError } from '@/composables/useFriendlyError'
import type { FriendlyError } from '@/utils/errorCodeRegistry'
import { resolveSafeRedirect } from '../utils/safeRedirect'
import { useTenantBranding } from '@/composables/useTenantBranding'

const route = useRoute()
const router = useRouter()
const authStore = useParentAuthStore()
const { getFriendly } = useFriendlyError()

const code = ref('')
const submitting = ref(false)
// friendly error 狀態：含 message + nextStep + level；null 表示無錯誤
const errorState = ref<FriendlyError | null>(null)
// 後端 BusinessError code：BIND_CODE_NOT_FOUND / EXPIRED / USED / INVALID / ALREADY_USED；其他失敗為空字串
const errorCode = ref('')

const nameHint = computed(() => String(route.query.name_hint || ''))
const trimmedCode = computed(() => code.value.trim().toUpperCase())
// EXPIRED / USED / ALREADY_USED 才需要「聯絡園所索取新碼」CTA；其他（含 NOT_FOUND）只需提示重新輸入
const needsNewCode = computed(
  () =>
    errorCode.value === 'BIND_CODE_EXPIRED' ||
    errorCode.value === 'BIND_CODE_USED' ||
    errorCode.value === 'BIND_CODE_ALREADY_USED',
)
// 多租戶（4d/fb）：園所電話改由品牌 API 提供（tenants.contact_json）。
// `VITE_SCHOOL_PHONE` 降為過渡 fallback——它連 Dockerfile ARG 都沒宣告，
// 正式 image 內恆為空字串，實務上等於已由品牌值接手。階段 3 連同這行一起刪。
// 顯示用 phone_display（人眼格式），撥號用 phone（E.164）。
const { branding } = useTenantBranding()
const schoolPhone = computed(
  () => branding.value.contact.phone_display || (import.meta.env.VITE_SCHOOL_PHONE as string | undefined) || '',
)
const schoolPhoneTel = computed(() => branding.value.contact.phone || schoolPhone.value)

function _setLocalError(message: string) {
  errorCode.value = ''
  errorState.value = { message, level: 'warning' }
}

async function submit() {
  errorState.value = null
  errorCode.value = ''
  if (!trimmedCode.value) {
    _setLocalError('請輸入綁定碼')
    return
  }
  submitting.value = true
  try {
    const { data } = await bind(trimmedCode.value)
    if (data?.status === 'ok' && data?.user) {
      authStore.setUser(data.user)
      router.replace(resolveSafeRedirect(route.query.redirect))
    } else {
      _setLocalError('綁定失敗，請聯絡園所')
    }
  } catch (err: unknown) {
    const e = err as AxiosError
    const detail = e?.errorDetail as { code?: string } | null | undefined
    errorCode.value = String(detail?.code || '')
    errorState.value = getFriendly(err)
  } finally {
    submitting.value = false
  }
}

function resetForRetry() {
  code.value = ''
  errorState.value = null
  errorCode.value = ''
}
</script>

<template>
  <div class="bind-view">
    <!-- 與後台/教師端登入頁同款 logo（512px 量化版，同 LoginView）。 -->
    <img
      class="welcome-mark"
      src="/images/login-logo-512.png"
      :alt="branding.org_name"
      width="512"
      height="512"
    >
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
          inputmode="text"
          autocapitalize="characters"
          autocorrect="off"
          autocomplete="one-time-code"
          placeholder="例：ABCD1234"
          maxlength="20"
          aria-describedby="bind-code-desc"
          @keydown.enter="submit"
        />
      </div>

      <div
        v-if="errorState"
        class="error"
        role="alert"
        aria-live="assertive"
        data-testid="bind-error"
      >
        <p class="error-message">
          <span class="material-symbols-rounded" aria-hidden="true">error</span>
          {{ errorState.message }}
        </p>
        <p
          v-if="errorState.nextStep"
          class="error-next-step"
          data-testid="bind-error-next-step"
        >
          <span class="material-symbols-rounded" aria-hidden="true">tips_and_updates</span>
          {{ errorState.nextStep }}
        </p>
      </div>

      <div v-if="needsNewCode" class="recovery-actions">
        <a
          v-if="schoolPhone"
          :href="`tel:${schoolPhoneTel}`"
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
  width: min(150px, 42vw);
  height: auto;
  margin: 20px auto 16px;
  display: block;
  filter: drop-shadow(0 8px 20px rgba(13, 144, 83, 0.18));
}

.bind-card {
  /* 用 token 保留半透明玻璃感：寫死白底在 dark 會變「近白 token 文字配白卡」 */
  background: color-mix(in srgb, var(--pt-surface-card, #fff) 92%, transparent);
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
  background: var(--pt-surface-card, #fff);
  box-shadow: 0 0 0 4px rgba(13, 144, 83, 0.12);
}

.error {
  display: flex;
  flex-direction: column;
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
.error .error-message {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.error .error-next-step {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  padding-top: 4px;
  border-top: 1px dashed var(--coral-300, #ffb5ad);
  color: var(--pt-text-body, #5a4a4a);
  font-weight: 400;
  line-height: 1.5;
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
