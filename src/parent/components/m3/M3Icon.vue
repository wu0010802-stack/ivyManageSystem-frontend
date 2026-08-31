<script setup lang="ts">
import { computed, useAttrs } from 'vue'

/**
 * Material Symbols Rounded icon 渲染元件。
 *
 * 用 font ligature 渲染（不是 SVG），由 parent/index.html 載入的 Material Symbols
 * Rounded font 提供字符。CSS font-variation-settings 控制 4 軸（FILL / wght /
 * GRAD / opsz）— 詳見 https://m3.material.io/styles/icons/overview
 *
 * 使用：
 *   <M3Icon name="home" />                          裝飾性，預設 24px
 *   <M3Icon name="close" aria-label="關閉" />        非裝飾，screen reader 讀 label
 *   <M3Icon name="favorite" filled />                FILL=1，實心
 *   <M3Icon name="menu" :size="32" />                自訂尺寸
 *
 * Icon 名清單：https://fonts.google.com/icons?icon.set=Material+Symbols&icon.style=Rounded
 */
const props = withDefaults(defineProps<{
  name: string
  size?: number | string
  filled?: boolean
  weight?: number | string
}>(), {
  size: 24,
  filled: false,
  weight: 400,
})

const attrs = useAttrs()
const isDecorative = computed<boolean>(() => attrs['aria-label'] == null)

const iconStyle = computed<Record<string, string | number>>(() => {
  const fontSize = typeof props.size === 'number' ? `${props.size}px` : props.size
  const fill = props.filled ? 1 : 0
  return {
    fontSize,
    fontVariationSettings: `"FILL" ${fill}, "wght" ${props.weight}, "GRAD" 0, "opsz" 24`,
    lineHeight: 1,
  }
})
</script>

<template>
  <span
    class="material-symbols-rounded m3-icon"
    :style="iconStyle"
    :aria-hidden="isDecorative ? 'true' : undefined"
  >{{ name }}</span>
</template>

<style scoped>
/* 盒模型/防跑版夾盒由全域 .material-symbols-rounded 提供（styles/icons.css），
   這裡只留元件層行為。舊 font-display: block 已移除——該屬性只在 @font-face
   內有效，寫在 class 上是 no-op（真正的 block 行為在 icons.css @font-face）。 */
.m3-icon {
  user-select: none;
}
</style>
