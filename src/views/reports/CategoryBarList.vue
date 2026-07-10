<script setup lang="ts">
import { computed } from 'vue'
import { money } from '@/utils/format'

const props = defineProps<{
  items: Array<{ label: string; amount: number }>
  colors?: string[]
}>()

const DEFAULT_COLORS = ['#67c23a', '#409eff', '#9b59b6', '#e6a23c', '#f56c6c', '#909399']

const sorted = computed(() =>
  [...props.items].sort((a, b) => (b.amount || 0) - (a.amount || 0)),
)
const total = computed(() => sorted.value.reduce((s, i) => s + (i.amount || 0), 0))

function pct(amount: number): number | null {
  if (!total.value) return null
  return (amount / total.value) * 100
}
function color(idx: number): string {
  const palette = props.colors && props.colors.length ? props.colors : DEFAULT_COLORS
  return palette[idx % palette.length]
}
</script>

<template>
  <div class="cat-list">
    <div
      v-for="(item, idx) in sorted"
      :key="item.label"
      class="cat-row"
      :class="{ 'cat-zero': !item.amount }"
      data-test="cat-row"
    >
      <span class="cat-swatch" :style="{ background: color(idx) }" />
      <span class="cat-label">{{ item.label }}</span>
      <span class="cat-amount">{{ money(item.amount) }}</span>
      <span class="cat-pct">{{ pct(item.amount) == null ? '—' : `${pct(item.amount)!.toFixed(1)}%` }}</span>
      <span class="cat-bar-track">
        <span class="cat-bar-fill" :style="{ width: `${pct(item.amount) ?? 0}%`, background: color(idx) }" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.cat-list { display: flex; flex-direction: column; gap: 10px; padding: 8px 4px; }
.cat-row {
  display: grid;
  grid-template-columns: 12px minmax(72px, auto) 1fr 52px;
  grid-template-areas: 'swatch label amount pct' '. bar bar bar';
  align-items: center;
  column-gap: 8px;
  row-gap: 4px;
  font-size: 13px;
}
.cat-swatch { grid-area: swatch; width: 10px; height: 10px; border-radius: 2px; }
.cat-label { grid-area: label; color: var(--text-primary); }
.cat-amount { grid-area: amount; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.cat-pct { grid-area: pct; text-align: right; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.cat-bar-track {
  grid-area: bar;
  display: block;
  height: 6px;
  border-radius: 3px;
  background: var(--el-fill-color-light);
  overflow: hidden;
}
.cat-bar-fill { display: block; height: 100%; border-radius: 3px; }
.cat-zero { opacity: 0.45; }
</style>
