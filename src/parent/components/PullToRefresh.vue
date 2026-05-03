<script setup>
/**
 * 家長 App 下拉刷新元件。
 *
 * 用法：
 *   <PullToRefresh :on-refresh="handleRefresh">
 *     <YourContent />
 *   </PullToRefresh>
 *
 *   const handleRefresh = async () => { await fetchAll() }
 *
 * 為何用 prop 而非 emit？emit 不回傳值，無法 await；用 function prop
 * 直接回傳 Promise，元件能正確等到 resolve/reject 才收回 indicator。
 *
 * 設計：
 *  - 指示器固定在 root 頂端（absolute），高度由 pullDistance 控制
 *  - content 用 transform translateY 跟著下拉（GPU 加速 + 不引發 reflow）
 *  - 拖曳中 transition: none；放開後加 240ms ease-out snap
 *  - reduced-motion 由 globals.css 全域 transition-duration: 0.001ms 規則接管
 */
import { computed, ref, watch } from 'vue'
import { usePullToRefresh } from '../composables/usePullToRefresh'

const props = defineProps({
  /** 自訂門檻（px），預設 64 */
  threshold: { type: Number, default: 64 },
  /** 停用（例如某些 view 不要下拉刷新） */
  disabled: { type: Boolean, default: false },
  /** 刷新處理函式（可 async）。元件會 await 後才收 indicator */
  onRefresh: { type: Function, default: null },
})

const dragging = ref(false)

const { rootRef, pullDistance, refreshing, armed, _triggerRefresh } = usePullToRefresh({
  threshold: props.threshold,
  enabled: () => !props.disabled,
  onRefresh: async () => {
    if (typeof props.onRefresh !== 'function') return
    // 即使父層 handler 是同步，也用 Promise.resolve 包一層
    await Promise.resolve(props.onRefresh())
  },
})

// dragging 用於切換 transition
watch(pullDistance, (v, old) => {
  if (v > 0 && !refreshing.value && armed.value) {
    dragging.value = true
  } else if (v === 0 || v === old) {
    dragging.value = false
  }
})

// indicator 文字 / 狀態
const phase = computed(() => {
  if (refreshing.value) return 'loading'
  if (pullDistance.value >= props.threshold) return 'release'
  if (pullDistance.value > 0) return 'pulling'
  return 'idle'
})

const arrowRotation = computed(() => {
  if (phase.value === 'release') return 'rotate(180deg)'
  // 隨拉動旋轉，0 → -180
  const ratio = Math.min(1, pullDistance.value / props.threshold)
  return `rotate(${-180 * ratio + 180}deg)`
})

const indicatorOpacity = computed(() => {
  if (refreshing.value) return 1
  return Math.min(1, pullDistance.value / props.threshold)
})

const contentStyle = computed(() => ({
  transform: `translate3d(0, ${pullDistance.value}px, 0)`,
  transition: dragging.value ? 'none' : 'transform 240ms cubic-bezier(0.4, 0, 0.2, 1)',
}))

const indicatorHeight = computed(() => `${pullDistance.value}px`)

defineExpose({ _triggerRefresh })
</script>

<template>
  <div ref="rootRef" class="ptr-root" :class="{ 'is-dragging': dragging, 'is-refreshing': refreshing }">
    <div
      class="ptr-indicator"
      :style="{ height: indicatorHeight, opacity: indicatorOpacity }"
      aria-hidden="true"
    >
      <div class="ptr-indicator-inner" :class="{ 'is-loading': refreshing }">
        <svg
          v-if="!refreshing"
          class="ptr-arrow"
          :style="{ transform: arrowRotation }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          width="20"
          height="20"
        >
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
        <svg
          v-else
          class="ptr-spinner"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          width="20"
          height="20"
        >
          <circle cx="12" cy="12" r="9" stroke-opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" />
        </svg>
        <span v-if="phase === 'pulling'" class="ptr-label">下拉刷新</span>
        <span v-else-if="phase === 'release'" class="ptr-label">放開以刷新</span>
        <span v-else-if="phase === 'loading'" class="ptr-label">載入中…</span>
      </div>
    </div>
    <div class="ptr-content" :style="contentStyle">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ptr-root {
  position: relative;
  overflow: visible;
}

.ptr-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  pointer-events: none;
  /* 由 inline style 控 height + opacity，這裡不放 transition：拖曳期間應該即時跟手 */
}

.is-dragging .ptr-indicator,
.is-refreshing .ptr-indicator {
  transition: none;
}

.ptr-root:not(.is-dragging):not(.is-refreshing) .ptr-indicator {
  transition: height 240ms cubic-bezier(0.4, 0, 0.2, 1), opacity 240ms ease-out;
}

.ptr-indicator-inner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  color: var(--brand-primary, #3f7d48);
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  letter-spacing: 0.02em;
}

.ptr-arrow {
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ptr-spinner {
  animation: ptr-spin 800ms linear infinite;
  transform-origin: 50% 50%;
}

@keyframes ptr-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .ptr-spinner { animation: none; }
  .ptr-arrow { transition: none; }
}

.ptr-content {
  /* 由 inline style 控 transform + transition */
  will-change: transform;
}
</style>
