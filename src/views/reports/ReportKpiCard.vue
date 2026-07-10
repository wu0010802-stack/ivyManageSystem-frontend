<script setup lang="ts">
import { deltaKind } from './financeTrend'

export interface KpiTrendItem {
  label: string
  delta: number | null
  invert?: boolean
  emptyText?: string
  test?: string
}

const props = defineProps<{
  label: string
  value: string
  valueTest?: string
  valueClass?: string
  accent?: 'green' | 'orange' | 'red' | 'blue'
  trends?: KpiTrendItem[]
  sub?: string
  note?: string
  noteTest?: string
}>()

function fmtPct(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

// good/bad 由 invert 翻轉：一般指標上升=好；支出/退款上升=壞
function trendClass(item: KpiTrendItem): string {
  const kind = deltaKind(item.delta)
  if (kind === 'flat') return 'trend-flat'
  if (kind === 'up') return item.invert ? 'trend-bad' : 'trend-good'
  if (kind === 'down') return item.invert ? 'trend-good' : 'trend-bad'
  return ''
}

function trendText(item: KpiTrendItem): string {
  const kind = deltaKind(item.delta)
  if (kind === 'flat') return '— 持平'
  if (kind == null || item.delta == null) return ''
  return `${kind === 'up' ? '↑' : '↓'} ${fmtPct(item.delta)}`
}

const visibleTrends = () =>
  (props.trends || []).filter(t => t.delta != null || t.emptyText)
</script>

<template>
  <el-card class="report-kpi" :class="accent ? `report-kpi--${accent}` : ''" shadow="never">
    <div class="kpi-label">{{ label }}</div>
    <div class="kpi-value" :class="valueClass" :data-test="valueTest">{{ value }}</div>
    <div v-for="item in visibleTrends()" :key="item.label" class="kpi-trend" :data-test="item.test">
      <template v-if="item.delta != null">
        <span :class="trendClass(item)">{{ trendText(item) }}</span>
        <span class="kpi-trend-label">{{ item.label }}</span>
      </template>
      <span v-else class="kpi-trend-label">{{ item.emptyText }}</span>
    </div>
    <div v-if="note" class="kpi-note" :data-test="noteTest">{{ note }}</div>
    <div v-if="sub" class="kpi-sub">{{ sub }}</div>
  </el-card>
</template>

<style scoped>
.report-kpi {
  text-align: center;
  padding: 12px 8px 10px;
  border-top: 3px solid transparent;
  height: 100%;
}
.report-kpi--green  { border-top-color: var(--color-success); }
.report-kpi--orange { border-top-color: var(--color-warning); }
.report-kpi--red    { border-top-color: var(--color-danger); }
.report-kpi--blue   { border-top-color: var(--color-info); }

.kpi-label { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 6px; }
.kpi-value { font-size: 26px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.kpi-trend { font-size: 12px; font-weight: 600; margin-top: 4px; min-height: 16px; }
.trend-good { color: var(--color-success); }
.trend-bad  { color: var(--color-danger); }
.trend-flat { color: var(--text-secondary); font-weight: normal; }
.kpi-trend-label { font-weight: normal; color: var(--text-secondary); margin-left: 4px; }
.kpi-note { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
.kpi-sub  { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

/* 語意色（正負淨現金） */
.kpi-value.value-green { color: var(--color-success); }
.kpi-value.value-red   { color: var(--color-danger); }
</style>
