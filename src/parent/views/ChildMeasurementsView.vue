<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { ChartData, ChartOptions } from 'chart.js'
import { LineChart } from '@/composables/useChartJs'
import { fetchChildMeasurementChart } from '../api/childMeasurements'
import { toast } from '../utils/toast'

const route = useRoute()
const studentId = computed(() => Number(route.params.studentId))

const metric = ref('height')
const chartData = ref<{
  height: { x: string; y: number | string }[]
  weight: { x: string; y: number | string }[]
}>({ height: [], weight: [] })
const loading = ref(false)

const METRIC_OPTIONS = [
  { value: 'height', label: '身高', unit: 'cm', icon: 'height' },
  { value: 'weight', label: '體重', unit: 'kg', icon: 'monitor_weight' },
]

const currentMetric = computed(() => METRIC_OPTIONS.find((o) => o.value === metric.value))
const currentSeries = computed(
  () => (chartData.value as Record<string, { x: string; y: number | string }[]>)[metric.value] || [],
)

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

const currentColor = computed(() => (metric.value === 'height' ? '#0d9053' : '#33aaaa'))
const currentFill = computed(() =>
  metric.value === 'height' ? 'rgba(13,144,83,0.08)' : 'rgba(51,170,170,0.08)',
)

const isEmpty = computed(() => currentSeries.value.length === 0)

const lineData = computed<ChartData<'line', (number | null)[]>>(() => ({
  labels: currentSeries.value.map((p) => p.x),
  datasets: [
    {
      label: currentMetric.value?.label ?? '',
      data: currentSeries.value.map((p) => {
        const n = Number(p.y)
        return Number.isFinite(n) ? n : null
      }),
      borderColor: currentColor.value,
      backgroundColor: currentFill.value,
      borderWidth: 2.5,
      tension: 0.3,
      pointStyle: 'circle',
      pointRadius: 6,
      pointBackgroundColor: currentColor.value,
      pointBorderColor: currentColor.value,
      fill: 'origin',
    },
  ],
}))

const lineOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 4, left: 4, right: 4, bottom: 4 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#fffcf2',
      borderColor: 'rgba(13,144,83,0.18)',
      borderWidth: 1,
      titleColor: '#392a1c',
      bodyColor: '#392a1c',
      titleFont: { size: 12 },
      bodyFont: { size: 12 },
      padding: 8,
      callbacks: {
        title: (items) => items[0]?.label ?? '',
        label: (ctx) =>
          `${currentMetric.value?.label ?? ''}：${ctx.parsed.y} ${currentMetric.value?.unit ?? ''}`,
      },
    },
  },
  scales: {
    x: {
      type: 'category',
      ticks: {
        maxRotation: 30,
        minRotation: 30,
        font: { size: 10 },
        color: '#6b7280',
      },
      grid: { display: false },
      border: { color: '#dceef5' },
    },
    y: {
      type: 'linear',
      beginAtZero: false,
      ticks: { font: { size: 10 }, color: '#6b7280' },
      grid: { color: '#f1f5ee' },
      border: { display: false },
    },
  },
}))

async function load() {
  if (!studentId.value) return
  loading.value = true
  try {
    const r = await fetchChildMeasurementChart(studentId.value, 24)
    chartData.value = r.data
  } catch (e) {
    const err = e as Record<string, unknown>
    toast.error(String(err?.displayMessage || '載入失敗'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
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
      <div class="chart">
        <LineChart v-if="!isEmpty" :data="lineData" :options="lineOptions" />
      </div>
      <p v-if="!loading && isEmpty" class="empty-msg">
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
  color: var(--pt-on-accent, #fff);
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
