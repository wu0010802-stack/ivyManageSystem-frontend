<script setup>
import { computed, useAttrs } from 'vue'

/**
 * Material Symbols Rounded icon 渲染元件。
 *
 * 用 font ligature 渲染（不是 SVG），由 parent.html 載入的 Material Symbols
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
const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 24 },
  filled: { type: Boolean, default: false },
  weight: { type: [Number, String], default: 400 },
})

const attrs = useAttrs()
const isDecorative = computed(() => attrs['aria-label'] == null)

const iconStyle = computed(() => {
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
.m3-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  font-style: normal;
  /* 確保 font 還沒載入時不會出現 raw ligature 字串太久 */
  font-display: block;
  vertical-align: middle;
}
</style>
