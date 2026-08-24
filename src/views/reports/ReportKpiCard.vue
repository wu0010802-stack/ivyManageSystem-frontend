<script setup lang="ts">
import { computed } from 'vue'
import { ElCard } from 'element-plus'
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
  /** cell：無卡片外框的壓縮帶格（給 OverviewPanel KPI band 用）；預設 card 行為不變 */
  variant?: 'card' | 'cell'
}>()

const isCell = computed(() => props.variant === 'cell')
const rootIs = computed(() => (isCell.value ? 'div' : ElCard))
const rootProps = computed(() => (isCell.value ? {} : { shadow: 'never' }))

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

const visibleTrends = computed(() =>
  (props.trends || []).filter(t => t.delta != null || t.emptyText))
</script>

<template>
  <component
    :is="rootIs"
    v-bind="rootProps"
    class="report-kpi"
    :class="[accent ? `report-kpi--${accent}` : '', isCell ? 'report-kpi--cell' : '']"
  >
    <div class="kpi-label">
      <span v-if="isCell" class="kpi-dot" aria-hidden="true"></span>
      {{ label }}
    </div>
    <div class="kpi-value" :class="valueClass" :data-test="valueTest">{{ value }}</div>
    <div v-for="item in visibleTrends" :key="item.label" class="kpi-trend" :data-test="item.test">
      <template v-if="item.delta != null">
        <span :class="trendClass(item)">{{ trendText(item) }}</span>
        <span class="kpi-trend-label">{{ item.label }}</span>
      </template>
      <span v-else class="kpi-trend-label">{{ item.emptyText }}</span>
    </div>
    <div v-if="note" class="kpi-note" :data-test="noteTest">{{ note }}</div>
    <div v-if="sub" class="kpi-sub">{{ sub }}</div>
  </component>
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

/* cell 變體：無外框、靠左、色點取代頂邊 accent（順序在 accent 規則之後，
   border-top-style:none 蓋掉上方 border-top-color 規則） */
.report-kpi--cell {
  border-top: none;
  text-align: left;
  padding: 16px 20px;
  height: auto;
}
.report-kpi--cell .kpi-label { display: flex; align-items: center; gap: 7px; }
.kpi-dot { width: 9px; height: 9px; border-radius: 3px; flex: 0 0 auto; background: var(--text-secondary); }
.report-kpi--cell.report-kpi--green  .kpi-dot { background: var(--color-success); }
.report-kpi--cell.report-kpi--orange .kpi-dot { background: var(--color-warning); }
.report-kpi--cell.report-kpi--red    .kpi-dot { background: var(--color-danger); }
.report-kpi--cell.report-kpi--blue   .kpi-dot { background: var(--color-info); }

.kpi-label { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 6px; }
.kpi-value { font-size: 26px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.kpi-trend { font-size: 12px; font-weight: 600; margin-top: 4px; min-height: 16px; }
.trend-good { color: var(--color-success); }
.trend-bad  { color: var(--color-danger); }
.trend-flat { color: var(--text-secondary); font-weight: normal; }
.kpi-trend-label { font-weight: normal; color: var(--text-secondary); margin-left: 4px; }
.kpi-note { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
.kpi-sub  { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

/* 語意色（正負淨現金／退款警示）。規則必須放在本元件內：呼叫端（父層 scoped）
   的 .value-* 規則只落在本元件根節點，打不到內部的 kpi-value div。 */
.kpi-value.value-green  { color: var(--color-success); }
.kpi-value.value-red    { color: var(--color-danger); }
.kpi-value.value-orange { color: var(--color-warning); }
</style>
