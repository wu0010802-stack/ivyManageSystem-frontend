<template>
  <div class="loading-panel">
    <template v-if="displayLoading">
      <slot v-if="variant === 'skeleton'" name="skeleton">
        <div class="loading-panel-spinner" role="status" aria-live="polite">
          <span class="loading-panel-dot" />
          <span class="loading-panel-dot" />
          <span class="loading-panel-dot" />
        </div>
      </slot>
      <slot v-else name="spinner">
        <div class="loading-panel-spinner" role="status" aria-live="polite">
          <span class="loading-panel-dot" />
          <span class="loading-panel-dot" />
          <span class="loading-panel-dot" />
        </div>
      </slot>
    </template>
    <template v-else-if="empty">
      <slot name="empty" />
    </template>
    <template v-else>
      <slot />
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  loading: { type: Boolean, default: false },
  empty: { type: Boolean, default: false },
  variant: {
    type: String,
    default: 'spinner',
    validator: (v) => v === 'spinner' || v === 'skeleton',
  },
  delay: { type: Number, default: 120 },
  minShowMs: { type: Number, default: 300 },
})

const displayLoading = ref(false)
let showTimer = null
let hideTimer = null
let shownAt = 0

function clearShowTimer() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

watch(
  () => props.loading,
  (loading) => {
    if (loading) {
      clearHideTimer()
      if (displayLoading.value || showTimer) return
      const doShow = () => {
        showTimer = null
        displayLoading.value = true
        shownAt = Date.now()
      }
      if (props.delay <= 0) doShow()
      else showTimer = setTimeout(doShow, props.delay)
    } else {
      clearShowTimer()
      if (!displayLoading.value) return
      const elapsed = Date.now() - shownAt
      const remaining = Math.max(0, props.minShowMs - elapsed)
      if (remaining <= 0) {
        displayLoading.value = false
      } else {
        hideTimer = setTimeout(() => {
          hideTimer = null
          displayLoading.value = false
        }, remaining)
      }
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearShowTimer()
  clearHideTimer()
})
</script>

<style scoped>
.loading-panel {
  position: relative;
  min-height: 120px;
}
.loading-panel-spinner {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
}
.loading-panel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f4b43f;
  animation: loading-panel-bounce 1s infinite ease-in-out both;
}
.loading-panel-dot:nth-child(1) { animation-delay: -0.3s; }
.loading-panel-dot:nth-child(2) { animation-delay: -0.15s; }
@keyframes loading-panel-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}
</style>
