<script setup lang="ts">
/**
 * P0c-3 LIFF consent modal — 強制同意關卡。
 *
 * 觸發時機（LoginView orchestrate）：
 * - 首次登入家長：current_status[service_essential].consented_at = null
 * - 既有家長且 policy 升版：current_status[service_essential].policy_version_id !== current_policy.id
 *
 * UX 原則：
 * - 「服務必要」勾選且強制必勾（不勾無法繼續）
 * - 其他 3 scope 可選（家長自行 opt-in）
 * - submit 後 fan-out 寫 4 個 consent 事件，全部成功才 close
 *
 * a11y：由 caller 以 v-if 掛載，掛上即是開啟。共用 useAccessibleDialog 做 focus trap
 * （Tab 不會跑到遮罩後面的登入頁／App）、初始焦點移到第一個勾選框、ref-count 捲動鎖
 * （背景不跟著捲）；強制關卡不提供 Esc 關閉。卸載時焦點還給開啟前的元素。
 *
 * Refs: docs/superpowers/specs/2026-05-28-consent-dsr-rights-design.md §3.3 + §3.4
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useAccessibleDialog } from '@/composables/useAccessibleDialog'
import {
  CONSENT_SCOPES,
  CONSENT_SCOPE_SERVICE_ESSENTIAL,
  SCOPE_DESCRIPTIONS,
  SCOPE_LABELS,
  type ConsentScope,
  type PolicyVersionOut,
  writeConsent,
} from '../api/consent'

const props = defineProps<{
  policy: PolicyVersionOut
}>()

const emit = defineEmits<{
  (e: 'consented'): void
}>()

const checked = ref<Record<ConsentScope, boolean>>({
  service_essential: false,
  photo_publish: false,
  line_push: false,
  cross_border_transfer: false,
})

const dialogRef = ref<HTMLElement | null>(null)
// 必須在 useAccessibleDialog 移動焦點前先記下開啟者
const openerEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
const { onDialogKeydown } = useAccessibleDialog({
  open: () => true,
  dialogRef,
  // 強制同意關卡：Esc 不關閉（useAccessibleDialog 仍會 stopPropagation，避免底下的 sheet 被 Esc 關掉）
  close: () => {},
})
onBeforeUnmount(() => {
  if (openerEl?.isConnected) openerEl.focus()
})

const status = ref<'init' | 'submitting' | 'error'>('init')
const errorMessage = ref('')

const canSubmit = computed(
  () => checked.value[CONSENT_SCOPE_SERVICE_ESSENTIAL] && status.value !== 'submitting',
)

async function handleSubmit() {
  if (!canSubmit.value) return
  status.value = 'submitting'
  errorMessage.value = ''

  try {
    // Fan-out 4 scope 各自寫 log（不論 true/false 都寫，記錄完整意向）
    await Promise.all(
      CONSENT_SCOPES.map(scope =>
        writeConsent({
          policy_version_id: props.policy.id,
          scope,
          consented: checked.value[scope],
        }),
      ),
    )
    emit('consented')
  } catch (err) {
    status.value = 'error'
    const e = err as { displayMessage?: string; message?: string }
    errorMessage.value =
      e?.displayMessage || e?.message || '同意紀錄寫入失敗，請稍後再試'
  }
}
</script>

<template>
  <div
    ref="dialogRef"
    class="consent-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="consent-title"
    tabindex="-1"
    @keydown="onDialogKeydown"
  >
    <div class="consent-card">
      <h2 id="consent-title" class="title">隱私權與個資告知</h2>
      <p class="version">版本：{{ policy.version }}（{{ policy.effective_at.slice(0, 10) }} 生效）</p>

      <div v-if="policy.summary" class="summary">{{ policy.summary }}</div>

      <p class="intro">
        依個人資料保護法 §8，園所須在蒐集您與子女個資前明確告知處理範圍。
        請逐項閱讀並選擇是否同意：
      </p>

      <ul class="scope-list">
        <li v-for="scope in CONSENT_SCOPES" :key="scope" class="scope-item">
          <label class="scope-label">
            <input
              type="checkbox"
              v-model="checked[scope]"
              :aria-describedby="`desc-${scope}`"
            />
            <span class="scope-text">
              <strong>{{ SCOPE_LABELS[scope] }}</strong>
              <small :id="`desc-${scope}`">{{ SCOPE_DESCRIPTIONS[scope] }}</small>
            </span>
          </label>
        </li>
      </ul>

      <p v-if="!checked.service_essential" class="warning" role="status">
        ※「服務必要」為使用本服務的最低條件，未勾選將無法繼續。
      </p>

      <p v-if="status === 'error'" class="error" role="alert">
        {{ errorMessage }}
      </p>

      <button
        type="button"
        class="submit-btn"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        {{ status === 'submitting' ? '處理中…' : '送出並繼續' }}
      </button>

      <p class="legal-note">
        若有問題請聯絡園所，您可隨時於「個人資料」頁面查閱或撤回同意。
      </p>
    </div>
  </div>
</template>

<style scoped>
.consent-overlay {
  position: fixed;
  inset: 0;
  outline: none;
  background: rgba(0, 0, 0, 0.56);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 2000;
  overflow-y: auto;
}

.consent-card {
  background: var(--cream, #fffcf2);
  border-radius: 16px;
  max-width: 480px;
  width: 100%;
  padding: 24px 20px;
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.24);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
}

.title {
  margin: 0 0 4px;
  font-size: 1.25rem;
  color: var(--brand-primary, #0d9053);
  letter-spacing: -0.01em;
}

.version {
  margin: 0 0 12px;
  font-size: 0.75rem;
  color: var(--pt-text-muted);
}

.summary {
  background: rgba(13, 144, 83, 0.06);
  border-radius: 12px;
  padding: 12px;
  font-size: 0.875rem;
  margin-bottom: 12px;
  line-height: 1.6;
}

.intro {
  font-size: 0.875rem;
  line-height: 1.7;
  color: var(--pt-text-body);
  margin: 12px 0 8px;
}

.scope-list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
}

.scope-item {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding: 12px 0;
}
.scope-item:first-child {
  border-top: none;
}

.scope-label {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  cursor: pointer;
  line-height: 1.5;
}

.scope-label input[type='checkbox'] {
  margin-top: 4px;
  min-width: 18px;
  min-height: 18px;
}

.scope-text strong {
  display: block;
  font-size: 0.9375rem;
  color: var(--pt-text-strong);
  margin-bottom: 2px;
}

.scope-text small {
  font-size: 0.75rem;
  color: var(--pt-text-muted);
  display: block;
}

.warning {
  background: var(--coral-100, #fff0e6);
  color: var(--coral-700, #b14545);
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.8125rem;
  margin: 8px 0 12px;
}

.error {
  background: var(--coral-100, #ffe3e0);
  color: var(--coral-700, #b14545);
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.8125rem;
  margin: 8px 0 12px;
}

.submit-btn {
  width: 100%;
  min-height: 48px;
  background: var(--m3-primary, #006d3d);
  color: var(--m3-on-primary, #fff);
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.legal-note {
  margin: 12px 0 0;
  font-size: 0.6875rem;
  color: var(--pt-text-faint);
  line-height: 1.6;
}
</style>
