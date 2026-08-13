<script setup lang="ts">
/**
 * IvyKids logo —— 正式徽章圖（`/LOGO.png`，透明底，雙童＋桂冠＋IVY KIDS 緞帶）。
 *
 * 2026-08-13 起不再以 SVG（LaurelWreath + CrownIcon + IvyRibbon）拼簡化版
 * ——使用者裁定簡化版「綠 W＋皇冠」觀感不佳，全面改用正式徽章圖。
 *
 * 使用：
 *   <BrandMark />                                 <!-- mini 32px：AppHeader 角落 -->
 *   <BrandMark variant="full" :size="100" />     <!-- 大尺寸（圖內已含 IVY KIDS 字樣） -->
 *   <BrandMark variant="mark-only" :size="48" />
 *
 * variant 僅保留 API 相容（三者現在都渲染同一張圖，尺寸由 size 控制）。
 */
import { computed, type CSSProperties } from 'vue'
import { useTenantBranding } from '@/composables/useTenantBranding'

defineOptions({ name: 'BrandMark' })

const props = withDefaults(defineProps<{
  variant?: 'mini' | 'full' | 'mark-only'
  size?: number
  /**
   * 無障礙名稱。預設用該租戶的機構名（多租戶 4d/fb；原為硬編「常春藤教育機構」）。
   */
  label?: string
}>(), {
  variant: 'mini',
  size: 32,
  label: '',
})

const { branding } = useTenantBranding()

const imgStyle = computed((): CSSProperties => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}))
</script>

<template>
  <img
    data-test="brand-mark"
    class="brand-mark"
    src="/LOGO.png"
    :alt="props.label || branding.org_name"
    :style="imgStyle"
    decoding="async"
  >
</template>

<style scoped>
.brand-mark {
  display: inline-block;
  object-fit: contain;
}
</style>
