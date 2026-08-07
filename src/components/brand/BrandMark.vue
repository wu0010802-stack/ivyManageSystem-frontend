<script setup lang="ts">
/**
 * IvyKids logo 三層次封裝。
 *
 * 使用：
 *   <BrandMark />                                 <!-- mini 32px：AppHeader 角落 -->
 *   <BrandMark variant="full" :size="100" />     <!-- 完整版 + IVY KIDS 緞帶 -->
 *   <BrandMark variant="mark-only" :size="48" /> <!-- 只圖標無文字 -->
 */
import { computed, type CSSProperties } from 'vue'
import LaurelWreath from './LaurelWreath.vue'
import CrownIcon from './CrownIcon.vue'
import IvyRibbon from './IvyRibbon.vue'
import { useTenantBranding } from '@/composables/useTenantBranding'

defineOptions({ name: 'BrandMark' })

const props = withDefaults(defineProps<{
  variant?: 'mini' | 'full' | 'mark-only'
  size?: number
  /**
   * 無障礙名稱。預設用該租戶的機構名（多租戶 4d/fb；原為硬編「常春藤教育機構」）。
   * 其餘 4 個純裝飾 SVG（LaurelWreath / CrownIcon / IvyRibbon）維持 aria-hidden，不 prop 化。
   */
  label?: string
}>(), {
  variant: 'mini',
  size: 32,
  label: '',
})

const { branding } = useTenantBranding()

const containerStyle = computed((): CSSProperties => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  position: 'relative',
  '--mark-size': `${props.size}px`,
}))

const showRibbon = computed(() => props.variant === 'full')

const wreathSize = computed(() => props.size)
const crownSize = computed(() => Math.round(props.size * 0.4))
</script>

<template>
  <span
    data-test="brand-mark"
    role="img"
    :aria-label="props.label || branding.org_name"
    :style="containerStyle"
    class="brand-mark"
  >
    <span class="brand-mark-stack">
      <LaurelWreath side="full" :opacity="1" :size="wreathSize" />
      <span class="brand-mark-crown">
        <CrownIcon :size="crownSize" decorative />
      </span>
    </span>
    <IvyRibbon v-if="showRibbon" class="brand-mark-ribbon">
      IVY KIDS
    </IvyRibbon>
  </span>
</template>

<style scoped>
.brand-mark {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.brand-mark-stack {
  position: relative;
  width: 100%;
  height: 100%;
}
.brand-mark-stack > svg {
  position: absolute;
  inset: 0;
}
.brand-mark-crown {
  position: absolute;
  left: 50%;
  top: 8%;
  transform: translateX(-50%);
}
.brand-mark-ribbon {
  margin-top: 8px;
  font-size: calc(var(--mark-size, 32px) * 0.4);
}
</style>
