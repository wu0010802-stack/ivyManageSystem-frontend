<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  values: (number | null)[]
  color?: string
}>()

const W = 120
const H = 36
const PAD = 3

// 只連有值的點；x 依 12 格均分，null 中斷
const points = computed(() => {
  const vals = props.values
  const nums = vals.filter((v): v is number => v != null)
  if (!nums.length) return ''
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const step = (W - PAD * 2) / Math.max(vals.length - 1, 1)
  return vals
    .map((v, i) => {
      if (v == null) return null
      const x = PAD + i * step
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .filter(Boolean)
    .join(' ')
})
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="sparkline" preserveAspectRatio="none" aria-hidden="true">
    <polyline :points="points" fill="none" :stroke="color || 'var(--color-info)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
.sparkline { width: 120px; height: 36px; display: block; }
</style>
