<script setup>
/**
 * 二擇一確認對話框，取代 window.confirm()。
 *
 * 為什麼不用原生 confirm？
 *  - 原生 dialog 在 LIFF webview 樣式不可控、跨 iOS/Android 視覺斷裂
 *  - 與 brand 視覺語言不一致
 *  - 無法套 destructive 變體（紅色）
 *
 * 為什麼不放 a11y 必修分類？
 *  - 原生 confirm 的 focus / screen reader 是 OS 處理的，無障礙其實 OK
 *  - 此元件純為了視覺一致性
 *
 * 用法：
 *   <ConfirmDialog
 *     v-model:open="show"
 *     title="確定要登出？"
 *     confirm-label="登出"
 *     destructive
 *     @confirm="doLogout"
 *   />
 */
import { computed } from 'vue'
import AppModal from './AppModal.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: '確定' },
  cancelLabel: { type: String, default: '取消' },
  /** destructive：confirm button 用 danger 色 */
  destructive: { type: Boolean, default: false },
})

const emit = defineEmits(['update:open', 'confirm', 'cancel'])

const titleId = computed(
  () => `confirm-title-${Math.random().toString(36).slice(2, 8)}`,
)
const messageId = computed(
  () => `confirm-msg-${Math.random().toString(36).slice(2, 8)}`,
)

function onCancel() {
  emit('update:open', false)
  emit('cancel')
}

function onConfirm() {
  emit('update:open', false)
  emit('confirm')
}
</script>

<template>
  <AppModal
    :open="open"
    :labelled-by="titleId"
    :described-by="message ? messageId : null"
    :max-width="'360px'"
    @update:open="(v) => $emit('update:open', v)"
    @close="onCancel"
  >
    <div class="confirm-body">
      <h3 :id="titleId" class="confirm-title">{{ title }}</h3>
      <p v-if="message" :id="messageId" class="confirm-message">{{ message }}</p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-cancel" @click="onCancel">
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          class="btn btn-confirm"
          :class="{ 'is-destructive': destructive }"
          @click="onConfirm"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.confirm-body {
  padding: var(--space-5, 20px);
}

.confirm-title {
  margin: 0 0 var(--space-3, 12px);
  font-size: var(--text-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--neutral-800, #1e293b);
  line-height: var(--line-height-tight, 1.25);
}

.confirm-message {
  margin: 0 0 var(--space-5, 20px);
  font-size: var(--text-base, 14px);
  color: var(--neutral-600, #475569);
  line-height: var(--line-height-base, 1.5);
}

.confirm-actions {
  display: flex;
  gap: var(--space-2, 8px);
  margin-top: var(--space-4, 16px);
}

.btn {
  flex: 1;
  min-height: var(--touch-target-min, 44px);
  padding: 0 var(--space-4, 16px);
  border-radius: var(--btn-radius, var(--radius-md, 8px));
  border: 1px solid transparent;
  font-size: var(--text-base, 14px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: background var(--transition-fast, 0.15s ease);
}

.btn-cancel {
  background: var(--neutral-100, #f1f5f9);
  color: var(--neutral-700, #334155);
}

.btn-cancel:active {
  background: var(--neutral-200, #e2e8f0);
}

.btn-confirm {
  background: var(--brand-primary, #3f7d48);
  color: var(--neutral-0, #fff);
}

.btn-confirm:active {
  background: var(--brand-primary-hover, #336440);
}

.btn-confirm.is-destructive {
  background: var(--color-danger, #ef4444);
}

.btn-confirm.is-destructive:active {
  background: #b91c1c;
}
</style>
