<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { AxiosError } from 'axios'
import { bindAdditional } from '../api/auth'
import { useChildrenStore } from '../stores/children'
import { toast } from '../utils/toast'
import BrandMark from '@/components/brand/BrandMark.vue'

const router = useRouter()
const childrenStore = useChildrenStore()

const code = ref('')
const submitting = ref(false)
const errorMessage = ref('')
// 後端 BusinessError code（含 BIND_CODE_NOT_FOUND/EXPIRED/USED 與 hijack 防護的 HTTPException 字串）
const errorCode = ref('')

const trimmed = computed(() => code.value.trim().toUpperCase())
const needsNewCode = computed(
  () => errorCode.value === 'BIND_CODE_EXPIRED' || errorCode.value === 'BIND_CODE_USED',
)
const schoolPhone = (import.meta.env.VITE_SCHOOL_PHONE as string | undefined) || ''

async function submit() {
  errorMessage.value = ''
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
    router.replace('/home')
  } catch (err: unknown) {
    const e = err as AxiosError
    const detail = e?.errorDetail as { code?: string } | null | undefined
    errorCode.value = String(detail?.code || '')
    errorMessage.value = String(e?.displayMessage || '綁定碼無效或已被使用')
    toast.error(errorMessage.value)
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
      <p
        v-if="errorMessage"
        class="error"
        role="alert"
        aria-live="assertive"
      >
        {{ errorMessage }}
      </p>

      <div v-if="needsNewCode" class="recovery-actions">
        <a
          v-if="schoolPhone"
          :href="`tel:${schoolPhone}`"
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
