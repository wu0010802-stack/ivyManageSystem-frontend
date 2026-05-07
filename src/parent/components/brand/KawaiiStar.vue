<script setup>
/**
 * IvyKids kawaii 黃星星（手繪表情）— 對齊官網 logo / favicon 的星星 motif。
 *
 * 使用：
 *   <KawaiiStar />                              <!-- 預設 24px smile，有 aria-label -->
 *   <KawaiiStar :size="48" expression="wink" /> <!-- 大尺寸眨眼版 -->
 *   <KawaiiStar decorative />                   <!-- 純裝飾，aria-hidden -->
 */
import { computed } from 'vue'

const props = defineProps({
  size: { type: Number, default: 24 },
  expression: { type: String, default: 'smile' }, // smile | wink | sleep
  decorative: { type: Boolean, default: false },
})

const mouthPath = computed(() => {
  if (props.expression === 'wink') return 'M27 35 Q30 40 33 35'
  if (props.expression === 'sleep') return 'M27 36 L33 36'
  return 'M27 35 Q30 38 33 35' // smile
})

const eyeLeft = computed(() =>
  props.expression === 'wink' ? 'M23 30 L27 30' : null,
)

const ariaProps = computed(() =>
  props.decorative
    ? { 'aria-hidden': 'true' }
    : { role: 'img', 'aria-label': '星星徽章' },
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 60 60"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="ariaProps"
  >
    <path
      d="M30 6 L36 22 L52 24 L40 36 L44 52 L30 44 L16 52 L20 36 L8 24 L24 22 Z"
      fill="var(--ivy-star-yellow, #ffde51)"
      stroke="var(--ivy-crown-gold, #f3c630)"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <!-- 左眼：smile/sleep 用點，wink 用線 -->
    <circle v-if="!eyeLeft" cx="25" cy="30" r="1.5" fill="#392a1c" />
    <path v-else :d="eyeLeft" stroke="#392a1c" stroke-width="2" stroke-linecap="round" fill="none" />
    <!-- 右眼一律是點 -->
    <circle cx="35" cy="30" r="1.5" fill="#392a1c" />
    <!-- 嘴 -->
    <path
      data-test="mouth"
      :d="mouthPath"
      stroke="#392a1c"
      stroke-width="1.5"
      fill="none"
      stroke-linecap="round"
    />
    <!-- 腮紅 -->
    <circle cx="22" cy="33" r="1.5" fill="#f3958c" opacity="0.6" />
    <circle cx="38" cy="33" r="1.5" fill="#f3958c" opacity="0.6" />
  </svg>
</template>
