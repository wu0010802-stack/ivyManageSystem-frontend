<script setup>
/**
 * IvyKids 月桂葉花環 — 對齊官網 logo 兩側對稱月桂葉。
 *
 * 使用：
 *   <LaurelWreath />                  <!-- 預設 full，opacity 0.18 -->
 *   <LaurelWreath side="left" />      <!-- 只左半，hero 水印用 -->
 *   <LaurelWreath :opacity="0.5" />   <!-- 較深，成就頁用 -->
 */
import { computed } from 'vue'

const props = defineProps({
  side: {
    type: String,
    default: 'full',
    validator: (v) => ['left', 'right', 'full'].includes(v),
  },
  opacity: { type: Number, default: 0.18 },
  size: { type: Number, default: 80 },
})

const showLeft = computed(() => props.side === 'left' || props.side === 'full')
const showRight = computed(() => props.side === 'right' || props.side === 'full')

const svgStyle = computed(() => ({ opacity: props.opacity }))
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 80 80"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    :style="svgStyle"
  >
    <g v-if="showLeft" data-test="laurel-left">
      <path
        d="M22 70 Q12 55 14 35 M22 70 Q18 60 16 45 M22 70 Q26 60 28 50"
        stroke="var(--ivy-green-laurel, #5aa842)"
        stroke-width="2.5"
        fill="none"
        stroke-linecap="round"
      />
      <ellipse cx="14" cy="42" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(-30 14 42)" />
      <ellipse cx="18" cy="55" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(-30 18 55)" />
      <ellipse cx="26" cy="48" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(30 26 48)" />
      <ellipse cx="22" cy="60" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(30 22 60)" />
    </g>
    <g v-if="showRight" data-test="laurel-right">
      <path
        d="M58 70 Q68 55 66 35 M58 70 Q62 60 64 45 M58 70 Q54 60 52 50"
        stroke="var(--ivy-green-laurel, #5aa842)"
        stroke-width="2.5"
        fill="none"
        stroke-linecap="round"
      />
      <ellipse cx="66" cy="42" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(30 66 42)" />
      <ellipse cx="62" cy="55" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(30 62 55)" />
      <ellipse cx="54" cy="48" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(-30 54 48)" />
      <ellipse cx="58" cy="60" rx="3.5" ry="7" fill="var(--ivy-green-laurel, #5aa842)" transform="rotate(-30 58 60)" />
    </g>
  </svg>
</template>
