<script setup>
/**
 * IvyKids 慶祝氣球組 — 用於生日、繳費完成、活動報名成功 toast。
 *
 * 動畫：預設緩慢漂浮（3s loop）。
 * `prefers-reduced-motion: reduce` 偏好下會自動禁用動畫，仍保留靜態氣球。
 *
 * 使用：
 *   <BalloonGroup />                    <!-- 預設 3 顆童彩 -->
 *   <BalloonGroup :count="5" />         <!-- 5 顆 -->
 *   <BalloonGroup :colors="['#FFD93D']" /> <!-- 自訂單色 -->
 */
import { computed } from 'vue'

const props = defineProps({
  count: { type: Number, default: 3 },
  colors: { type: Array, default: null },
})

const DEFAULT_COLORS = [
  '#ffde51', // yellow
  '#f3958c', // coral
  '#f65265', // pink
  '#9f89bd', // purple
  '#5aa842', // green
  '#33aaaa', // teal
]

const balloons = computed(() => {
  const palette = props.colors && props.colors.length ? props.colors : DEFAULT_COLORS
  return Array.from({ length: props.count }).map((_, i) => ({
    color: palette[i % palette.length],
    cx: 20 + i * 30,
    cy: 30 + (i % 2) * 8,
    delay: i * 0.4,
  }))
})
</script>

<template>
  <svg
    :width="count * 40"
    :height="80"
    viewBox="0 0 200 80"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g
      v-for="(b, i) in balloons"
      :key="i"
      data-test="balloon"
      class="balloon"
      :style="`animation-delay: ${b.delay}s`"
    >
      <ellipse :cx="b.cx" :cy="b.cy" rx="10" ry="13" :fill="b.color" />
      <line :x1="b.cx" :y1="b.cy + 13" :x2="b.cx" :y2="b.cy + 35" stroke="#392a1c" stroke-width="0.8" />
    </g>
  </svg>
</template>

<style scoped>
.balloon {
  animation: balloon-float 3s ease-in-out infinite;
  transform-origin: center;
}
@keyframes balloon-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-6px); }
}
@media (prefers-reduced-motion: reduce) {
  .balloon { animation: none !important; }
}
</style>
