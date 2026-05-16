<!-- src/parent/views/ChildMeasurementsView.vue -->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchChildMeasurementChart } from '../api/childMeasurements'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'

let echarts = null

const route = useRoute()
const router = useRouter()
const studentId = computed(() => Number(route.params.studentId))

const metric = ref('height')
const chartData = ref({ height: [], weight: [] })
const loading = ref(false)
const chartEl = ref(null)
let chartInstance = null

const METRIC_OPTIONS = [
  { value: 'height', label: '身高 (cm)' },
  { value: 'weight', label: '體重 (kg)' },
]

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
  const { GridComponent, TooltipComponent, TitleComponent } = await import('echarts/components')
  const { CanvasRenderer } = await import('echarts/renderers')
  core.use([LineChart, GridComponent, TooltipComponent, TitleComponent, CanvasRenderer])
  echarts = core
}

function m3Color(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--m3-${name}`)
    .trim()
  return v || fallback
}

async function render() {
  await ensureEcharts()
  if (!chartEl.value) return
  if (!chartInstance) chartInstance = echarts.init(chartEl.value)
  const series = chartData.value[metric.value] || []
  chartInstance.setOption({
    grid: { top: 40, left: 50, right: 20, bottom: 50 },
    xAxis: {
      type: 'category',
      data: series.map((p) => p.x),
      axisLabel: { rotate: 30, fontSize: 10 },
    },
    yAxis: { type: 'value', scale: true },
    series: [{
      type: 'line',
      smooth: true,
      data: series.map((p) => Number(p.y)),
      itemStyle: { color: m3Color(metric.value === 'height' ? 'primary' : 'tertiary', metric.value === 'height' ? '#006d3d' : '#3a6571') },
      lineStyle: { width: 2 },
    }],
  })
}

function goBack() { router.back() }

onMounted(load)
watch(metric, render)
onBeforeUnmount(() => {
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<template>
  <div class="child-measurements-view">
    <header>
      <button class="back-btn" @click="goBack"><ParentIcon name="arrow-left" size="sm" />返回</button>
      <h2>量測曲線</h2>
    </header>

    <div class="metric-tabs">
      <button
        v-for="opt in METRIC_OPTIONS"
        :key="opt.value"
        :class="{ active: metric === opt.value }"
        @click="metric = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <div ref="chartEl" class="chart" />

    <p v-if="!loading && (!chartData[metric] || chartData[metric].length === 0)" class="placeholder">
      尚無 {{ METRIC_OPTIONS.find((o) => o.value === metric)?.label }} 紀錄
    </p>
  </div>
</template>

<style scoped>
.child-measurements-view { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
header { display: flex; align-items: center; gap: 12px; }
header > h2 { margin: 0; font-size: 17px; color: var(--m3-on-surface, var(--pt-text-strong)); }
.back-btn {
  background: none; border: none; font-size: 14px;
  color: var(--m3-primary, var(--brand-primary));
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 0; cursor: pointer;
}
.metric-tabs { display: flex; gap: 8px; }
.metric-tabs > button {
  flex: 1;
  padding: 10px;
  background: var(--m3-surface-container-low, var(--pt-surface-card));
  border: none;
  border-radius: 12px;
  font-size: 14px;
  color: var(--m3-on-surface, var(--pt-text-strong));
}
.metric-tabs > button.active {
  background: var(--m3-primary, var(--brand-primary));
  color: #fff;
}
.chart { width: 100%; height: 280px; }
.placeholder { padding: 24px; text-align: center; color: var(--text-tertiary); }
</style>
