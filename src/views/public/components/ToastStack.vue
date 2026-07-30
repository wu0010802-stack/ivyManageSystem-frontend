<script setup lang="ts">
/**
 * A1-P4：從 ActivityPublicView 抽出的 toast 通知堆疊。
 *
 * Props:
 *   toasts: array of { id, message, type } — type ∈ success | error | warning | info
 * Emits:
 *   dismiss(id) — 使用者點關閉按鈕時 emit
 *
 * 設計：保留 SVG icon 內嵌（與原 view 一致避免 sprite 重複），icon 在元件內常數化。
 */
interface Toast { id: number; message: string; type: string }
defineProps<{
  toasts: Toast[]
}>()
defineEmits<{
  (e: 'dismiss', id: number): void
}>()

const TOAST_ICONS: Record<string, string> = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="#0D9053" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
}
</script>

<template>
  <div class="toast-container" aria-live="polite" aria-atomic="true">
    <div
      v-for="t in toasts"
      :key="t.id"
      class="toast"
      :class="t.type"
      :role="t.type === 'error' ? 'alert' : 'status'"
    >
      <div class="toast-icon" v-html="TOAST_ICONS[t.type] || TOAST_ICONS.info" />
      <div class="toast-content">
        <div class="toast-message">{{ t.message }}</div>
      </div>
      <button
        type="button"
        class="toast-close tap-target"
        aria-label="關閉通知"
        @click="$emit('dismiss', t.id)"
      >&times;</button>
    </div>
  </div>
</template>

<style scoped>
/* Scoped 自帶：parent ActivityPublicView 的 <style scoped> 加的 data-v-* 不會
   套到子元件 DOM；此處讓 .toast / .toast-icon 等內部元素 layout 與 type tint
   正確套用。同時把原本 border-left: 4px 違反「絕對禁令」的 side-stripe 替換為
   tint background + 1px full border，type cue 由 icon + 背景色一起傳達。 */

.toast-container {
  position: fixed;
  top: var(--space-5);
  right: var(--space-5);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: calc(100vw - 40px);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 300px;
  max-width: 440px;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border-muted);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  animation: toastSlideIn var(--dur-slow) var(--ease-out);
}
.toast.success {
  background: rgba(13, 144, 83, 0.06);
  border-color: rgba(13, 144, 83, 0.22);
}
.toast.error {
  background: rgba(220, 38, 38, 0.06);
  border-color: rgba(220, 38, 38, 0.22);
}
.toast.warning {
  background: rgba(217, 119, 6, 0.06);
  border-color: rgba(217, 119, 6, 0.22);
}
.toast-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-top: 1px;
}
.toast-content { flex: 1; min-width: 0; }
.toast-message {
  font-size: var(--fs-sm);
  line-height: 1.5;
  color: var(--color-text-muted);
  white-space: pre-line;
  word-break: break-word;
}
.toast-close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: none;
  border-radius: var(--radius-full);
  color: var(--color-text-subtle);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.toast-close:hover {
  background-color: var(--color-surface-muted);
  color: var(--color-text);
}

@keyframes toastSlideIn {
  from { transform: translateX(32px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .toast { animation: none; }
}
</style>
