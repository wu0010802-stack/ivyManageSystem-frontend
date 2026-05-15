<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
])

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  metric: { type: String, default: 'height' },
  title: { type: String, default: '' },
})

const chartEl = ref(null)
let chartInstance = null

const yAxisLabel = computed(() => {
  if (['height', 'head_circumference'].includes(props.metric)) return 'cm'
  if (props.metric === 'weight') return 'kg'
  return ''
})

const seriesName = computed(() => {
  const MAP = {
    height: '身高 (cm)',
    weight: '體重 (kg)',
    head_circumference: '頭圍 (cm)',
    vision_left: '左眼視力',
    vision_right: '右眼視力',
  }
  return MAP[props.metric] || props.metric
})

const isEmpty = computed(() => {
  const arr = props.data?.[props.metric]
  return !Array.isArray(arr) || arr.length === 0
})

function buildOption() {
  const points = (props.data?.[props.metric] || []).slice().sort((a, b) =>
    a.x < b.x ? -1 : a.x > b.x ? 1 : 0
  )
  const xData = points.map((p) => p.x)
  const yData = points.map((p) => p.y)

  return {
    title: props.title
      ? { text: props.title, left: 'center', textStyle: { fontSize: 14 } }
      : undefined,
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        if (!p) return ''
        return `${p.axisValue}<br/>${seriesName.value}：${p.value}`
      },
    },
    grid: { left: 50, right: 20, top: props.title ? 48 : 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { rotate: 30, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: yAxisLabel.value,
      nameTextStyle: { fontSize: 12 },
      axisLabel: { fontSize: 11 },
    },
    series: [
      {
        name: seriesName.value,
        type: 'line',
        data: yData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: '#0d9053', width: 2 },
        itemStyle: { color: '#0d9053' },
      },
    ],
  }
}

function render() {
  if (!chartInstance) return
  chartInstance.setOption(buildOption(), true)
}

function handleResize() {
  chartInstance?.resize()
}

onMounted(() => {
  if (chartEl.value) {
    chartInstance = echarts.init(chartEl.value)
    render()
    window.addEventListener('resize', handleResize)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  chartInstance = null
})

watch([() => props.data, () => props.metric], render)
</script>

<template>
  <div class="measurement-chart-wrap">
    <div v-show="!isEmpty" ref="chartEl" class="measurement-chart" />
    <div v-if="isEmpty" class="measurement-chart-empty">尚無 {{ seriesName }} 紀錄</div>
  </div>
</template>

<style scoped>
.measurement-chart-wrap {
  position: relative;
  width: 100%;
  height: 320px;
}
.measurement-chart {
  width: 100%;
  height: 100%;
}
.measurement-chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>
