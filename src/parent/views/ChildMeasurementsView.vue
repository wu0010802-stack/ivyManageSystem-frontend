<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchChildMeasurementChart } from '../api/childMeasurements'
import { toast } from '../utils/toast'

let echarts = null

const route = useRoute()
const studentId = computed(() => Number(route.params.studentId))

const metric = ref('height')
const chartData = ref({ height: [], weight: [] })
const loading = ref(false)
const chartEl = ref(null)
let chartInstance = null

const METRIC_OPTIONS = [
  { value: 'height', label: '身高', unit: 'cm', icon: 'height' },
  { value: 'weight', label: '體重', unit: 'kg', icon: 'monitor_weight' },
]

const currentMetric = computed(() => METRIC_OPTIONS.find((o) => o.value === metric.value))
const currentSeries = computed(() => chartData.value[metric.value] || [])

const latestValue = computed(() => {
  const s = currentSeries.value
  return s.length ? Number(s[s.length - 1].y) : null
})
const firstValue = computed(() => {
  const s = currentSeries.value
  return s.length ? Number(s[0].y) : null
})
const trend = computed(() => {
  if (latestValue.value == null || firstValue.value == null) return null
  return Number((latestValue.value - firstValue.value).toFixed(1))
})

async function load() {
  if (!studentId.value) return
  loading.value = true
  try {
    const r = await fetchChildMeasurementChart(studentId.value, 24)
    chartData.value = r.data
    await render()
  } catch (e) {
    toast.error(e?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

async function ensureEcharts() {
  if (echarts) return
  const core = await import('echarts/core')
  const { LineChart } = await import('echarts/charts')
  const { GridComponent, TooltipComponent } = await import('echarts/components')
  const { CanvasRenderer } = await import('echarts/renderers')
  core.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])
  echarts = core
}

async function render() {
  await ensureEcharts()
  if (!chartEl.value) return
  if (!chartInstance) chartInstance = echarts.init(chartEl.value)
  const series = currentSeries.value
  const color = metric.value === 'height' ? '#0d9053' : '#33aaaa'
  chartInstance.setOption({
    grid: { top: 16, left: 40, right: 16, bottom: 36 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fffcf2',
      borderColor: 'rgba(13, 144, 83, 0.18)',
      textStyle: { color: '#392a1c', fontSize: 12 },
    },
    xAxis: {
      type: 'category',
      data: series.map((p) => p.x),
      axisLabel: { rotate: 30, fontSize: 10, color: '#6b7280' },
      axisLine: { lineStyle: { color: '#dceef5' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { fontSize: 10, color: '#6b7280' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#f1f5ee' } },
    },
    series: [{
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      data: series.map((p) => Number(p.y)),
      itemStyle: { color },
      lineStyle: { width: 2.5, color },
      areaStyle: { color: color, opacity: 0.08 },
    }],
  })
}

onMounted(load)
watch(metric, render)
onBeforeUnmount(() => {
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<template>
  <div class="meas-view">
    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">成長量測</p>
      <h1 class="pt-page-hero-title">{{ currentMetric?.label }}曲線</h1>
      <p v-if="latestValue != null" class="pt-page-hero-note">
        最新 <strong>{{ latestValue }} {{ currentMetric?.unit }}</strong>
        <span v-if="trend != null && trend !== 0" class="trend" :class="{ up: trend > 0 }">
          <span class="material-symbols-rounded" aria-hidden="true">{{ trend > 0 ? 'arrow_upward' : 'arrow_downward' }}</span>
          {{ Math.abs(trend) }} {{ currentMetric?.unit }}
        </span>
      </p>
    </header>

    <div class="metric-tabs pt-section-pad-x">
      <button
        v-for="opt in METRIC_OPTIONS"
        :key="opt.value"
        type="button"
        :class="{ active: metric === opt.value }"
        @click="metric = opt.value"
      >
        <span class="material-symbols-rounded" aria-hidden="true">{{ opt.icon }}</span>
        {{ opt.label }}
      </button>
    </div>

    <div class="pt-card chart-card">
      <div ref="chartEl" class="chart" />
      <p v-if="!loading && currentSeries.length === 0" class="empty-msg">
        尚無 {{ currentMetric?.label }} 紀錄
      </p>
    </div>
  </div>
</template>

<style scoped>
.meas-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
}

.trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
  color: var(--brand-primary, #0d9053);
  font-weight: 600;
}
.trend.up { color: var(--brand-primary, #0d9053); }
.trend:not(.up) { color: var(--sky-700, #2d6f8e); }
.trend .material-symbols-rounded { font-size: 14px; }

.metric-tabs {
  display: flex;
  gap: 8px;
}
.metric-tabs > button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--pt-text-muted);
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
  font-family: inherit;
}
.metric-tabs > button .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'wght' 500;
}
.metric-tabs > button.active {
  background: var(--brand-primary, #0d9053);
  color: #fff;
  border-color: var(--brand-primary, #0d9053);
}

.chart-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.chart {
  width: 100%;
  height: 260px;
}
.empty-msg {
  margin: 0;
  padding: 20px 16px;
  text-align: center;
  color: var(--pt-text-faint);
  font-size: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .metric-tabs > button { transition: none; }
}
</style>
