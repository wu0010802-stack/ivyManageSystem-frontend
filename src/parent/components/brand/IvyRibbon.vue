<script setup>
/**
 * IvyKids 綠緞帶容器 — 對齊官網 logo 內 "IVY KIDS" 緞帶。
 *
 * 使用：
 *   <IvyRibbon>IVY KIDS</IvyRibbon>            <!-- 預設深綠 -->
 *   <IvyRibbon color="teal">通知</IvyRibbon>   <!-- 藍綠 -->
 */
import { computed } from 'vue'

const props = defineProps({
  color: {
    type: String,
    default: 'green',
    validator: (v) => ['green', 'teal'].includes(v),
  },
})

const bgFill = computed(() =>
  props.color === 'teal' ? 'var(--ivy-teal-primary, #33aaaa)' : 'var(--ivy-green-deep, #0d9053)',
)
</script>

<template>
  <span class="ivy-ribbon">
    <svg
      class="ivy-ribbon-svg"
      viewBox="0 0 200 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        data-test="ribbon-bg"
        d="M0 6 L12 0 L188 0 L200 6 L188 40 L12 40 Z"
        :fill="bgFill"
      />
    </svg>
    <span class="ivy-ribbon-text">
      <slot />
    </span>
  </span>
</template>

<style scoped>
.ivy-ribbon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 18px;
  min-height: 32px;
  color: var(--ivy-star-yellow, #ffde51);
  font-weight: 700;
  letter-spacing: 1px;
}
.ivy-ribbon-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ivy-ribbon-text {
  position: relative;
  z-index: 1;
}
</style>
