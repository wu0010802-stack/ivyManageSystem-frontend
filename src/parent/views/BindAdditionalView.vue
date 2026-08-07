<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AxiosError } from 'axios'
import { bindAdditional } from '../api/auth'
import { useChildrenStore } from '../stores/children'
import { toast } from '../utils/toast'
import { useFriendlyError } from '@/composables/useFriendlyError'
import type { FriendlyError } from '@/utils/errorCodeRegistry'
import { useTenantBranding } from '@/composables/useTenantBranding'
import BrandMark from '@/components/brand/BrandMark.vue'
import { resolveSafeRedirect } from '../utils/safeRedirect'

const route = useRoute()
const router = useRouter()
const childrenStore = useChildrenStore()
const { getFriendly } = useFriendlyError()

const code = ref('')
const submitting = ref(false)
const errorState = ref<FriendlyError | null>(null)
// 後端 BusinessError code（含 BIND_CODE_NOT_FOUND/EXPIRED/USED/INVALID/ALREADY_USED 與 hijack 防護的 HTTPException）
const errorCode = ref('')

const trimmed = computed(() => code.value.trim().toUpperCase())
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

async function submit() {
  errorState.value = null
  errorCode.value = ''
  if (!trimmed.value) {
    toast.warn('請輸入綁定碼')
    return
  }
  submitting.value = true
  try {
    await bindAdditional(trimmed.value)
    toast.success('已加綁，正在重新整理子女清單')
    childrenStore.invalidate()
    await childrenStore.load(true)
    router.replace(resolveSafeRedirect(route.query.redirect))
  } catch (err: unknown) {
    const e = err as AxiosError
    const detail = e?.errorDetail as { code?: string } | null | undefined
    errorCode.value = String(detail?.code || '')
    errorState.value = getFriendly(err)
    // toast 仍保留作為立即觸發提示（visible 即使 user 已 scroll 開 input 區），inline 區塊提供 nextStep
    toast.error(errorState.value.message)
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
  <div class="bind-add-view">
    <BrandMark variant="full" :size="100" class="welcome-mark" />
    <div class="card pt-card">
      <h2 class="title">加綁第二個小孩</h2>
      <p class="desc">
        請輸入由園所提供的另一張綁定碼。完成後，新的小孩將會出現在您的子女清單中。
      </p>
      <div class="input-group">
        <label for="bind-add-code" class="sr-only">加綁綁定碼</label>
        <input
          id="bind-add-code"
          v-model="code"
          type="text"
          :inputmode="('latin' as any)"
          autocapitalize="characters"
          autocomplete="one-time-code"
          placeholder="例：ABCD1234"
          maxlength="20"
          @keydown.enter="submit"
        />
      </div>
      <div
        v-if="errorState"
        class="error"
        role="alert"
        aria-live="assertive"
        data-testid="bind-add-error"
      >
        <p class="error-message">{{ errorState.message }}</p>
        <p
          v-if="errorState.nextStep"
          class="error-next-step"
          data-testid="bind-add-error-next-step"
        >
          💡 {{ errorState.nextStep }}
        </p>
      </div>

      <div v-if="needsNewCode" class="recovery-actions">
        <a
          v-if="schoolPhone"
          :href="`tel:${schoolPhoneTel}`"
          class="pt-action-btn recovery-call"
        >
          聯絡園所 {{ schoolPhone }}
        </a>
        <button
          type="button"
          class="pt-action-btn recovery-retry"
          @click="resetForRetry"
        >
          我已重新拿碼
        </button>
      </div>

      <button
        class="pt-action-btn submit-btn"
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
.bind-add-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--pt-gradient-hero);
}

.welcome-mark {
  margin: var(--space-6, 32px) auto var(--space-5, 24px);
  display: block;
}

.card {
  max-width: 360px;
  width: 100%;
  box-shadow: var(--m3-elev-1, var(--pt-elev-2));
  margin: 0;
}

.title {
  margin: 0 0 8px;
  font-size: 18px;
  color: var(--brand-primary);
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
  color: var(--coral-700, #b14545);
  font-size: 13px;
  margin: 12px 0 0;
  padding: 10px 12px;
  background: var(--coral-100, #ffe3e0);
  border-radius: 10px;
  font-weight: 500;
}
.error .error-message {
  margin: 0;
}
.error .error-next-step {
  margin: 4px 0 0;
  padding-top: 4px;
  border-top: 1px dashed var(--coral-300, #ffb5ad);
  color: var(--pt-text-body, #5a4a4a);
  font-weight: 400;
  font-size: 12px;
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
  color: var(--brand-primary);
  border: 1px solid rgba(13, 144, 83, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  border-radius: 12px;
}
.recovery-retry {
  background: transparent;
}

.submit-btn {
  width: 100%;
  margin-top: 16px;
}
</style>
