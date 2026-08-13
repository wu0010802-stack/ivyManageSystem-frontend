<script setup lang="ts">
/**
 * ⚠ 本元件用 Material Symbols ligature 字型渲染圖示，該字型只有家長端載入
 * （src/parent/styles/icons.css，自架子集）。admin / public 入口未載字型，
 * 在那邊使用會 render 成 "error" 原文——要用請改 EP 圖示或先載字型。
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  error?: Error | { displayMessage?: string; message?: string } | string | null
  fallbackMessage?: string
}>(), {
  error: null,
  fallbackMessage: '載入失敗，請稍後再試',
})

defineEmits<{
  retry: []
}>()

const message = computed(() => {
  if (!props.error) return props.fallbackMessage
  if (typeof props.error === 'string') return props.error
  return (
    (props.error as { displayMessage?: string }).displayMessage ||
    (props.error as { message?: string }).message ||
    props.fallbackMessage
  )
})
</script>

<template>
  <div class="mobile-error-retry" role="alert">
    <span class="material-symbols-rounded mobile-error-retry__icon" aria-hidden="true">error</span>
    <p class="mobile-error-retry__message">{{ message }}</p>
    <button class="mobile-error-retry__btn" type="button" @click="$emit('retry')">
      重試
    </button>
  </div>
</template>

<style scoped>
.mobile-error-retry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}
.mobile-error-retry__icon {
  font-size: 28px;
  line-height: 1;
  margin-bottom: 8px;
  color: var(--color-danger, #c0392b);
}
.mobile-error-retry__message {
  margin: 0 0 16px;
  color: var(--color-danger, #c0392b);
  font-size: 14px;
  max-width: 280px;
}
.mobile-error-retry__btn {
  padding: 8px 24px;
  background: var(--brand-primary);
  color: var(--pt-on-accent, #fff);
  border: none;
  border-radius: 6px;
  font-size: 14px;
}
.mobile-error-retry__btn:active {
  opacity: 0.85;
}
</style>
