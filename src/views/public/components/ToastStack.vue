<script setup>
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
defineProps({
  toasts: { type: Array, required: true },
})
defineEmits(['dismiss'])

const TOAST_ICONS = {
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
        class="toast-close"
        aria-label="關閉通知"
        @click="$emit('dismiss', t.id)"
      >&times;</button>
    </div>
  </div>
</template>
