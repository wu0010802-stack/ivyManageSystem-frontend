<script setup>
/**
 * IvyKids 皇冠 — 對齊官網 logo 的金色皇冠 motif。
 *
 * 使用：
 *   <CrownIcon />                          <!-- 預設 20px gold + aria-label -->
 *   <CrownIcon :size="32" variant="silver" /> <!-- 銀冠 -->
 *   <CrownIcon decorative />               <!-- 純裝飾 aria-hidden -->
 */
import { computed } from 'vue'

const props = defineProps({
  size: { type: Number, default: 20 },
  variant: {
    type: String,
    default: 'gold',
    validator: (v) => ['gold', 'silver'].includes(v),
  },
  decorative: { type: Boolean, default: false },
})

const bodyFill = computed(() =>
  props.variant === 'silver' ? '#d0d0d0' : 'var(--ivy-star-yellow, #ffde51)',
)
const strokeColor = computed(() =>
  props.variant === 'silver' ? '#999' : 'var(--ivy-crown-gold, #f3c630)',
)
const gemColor = computed(() => (props.variant === 'silver' ? '#33aaaa' : '#f65265'))

const ariaProps = computed(() =>
  props.decorative
    ? { 'aria-hidden': 'true' }
    : { role: 'img', 'aria-label': '皇冠' },
)
</script>

<template>
  <svg
    :width="size"
    :height="Math.round(size * 0.7)"
    viewBox="0 0 60 40"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="ariaProps"
  >
    <path
      data-test="crown-body"
      d="M10 32 L16 12 L24 26 L30 8 L36 26 L44 12 L50 32 Z"
      :fill="bodyFill"
      :stroke="strokeColor"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <circle cx="16" cy="12" r="3" :fill="gemColor" />
    <circle cx="30" cy="8" r="3" :fill="gemColor" />
    <circle cx="44" cy="12" r="3" :fill="gemColor" />
  </svg>
</template>
