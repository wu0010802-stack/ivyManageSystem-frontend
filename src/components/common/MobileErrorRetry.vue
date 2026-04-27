<script setup>
import { computed } from 'vue'

const props = defineProps({
  error: { type: [Error, Object, String, null], default: null },
  fallbackMessage: { type: String, default: '載入失敗，請稍後再試' },
})

defineEmits(['retry'])

const message = computed(() => {
  if (!props.error) return props.fallbackMessage
  if (typeof props.error === 'string') return props.error
  return (
    props.error.displayMessage ||
    props.error.message ||
    props.fallbackMessage
  )
})
</script>

<template>
  <div class="mobile-error-retry" role="alert">
    <div class="mobile-error-retry__icon" aria-hidden="true">⚠️</div>
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
}
.mobile-error-retry__message {
  margin: 0 0 16px;
  color: #c0392b;
  font-size: 14px;
  max-width: 280px;
}
.mobile-error-retry__btn {
  padding: 8px 24px;
  background: #3f7d48;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
}
.mobile-error-retry__btn:active {
  opacity: 0.85;
}
</style>
