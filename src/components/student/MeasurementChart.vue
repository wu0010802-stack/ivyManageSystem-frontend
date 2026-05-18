<script setup lang="ts">
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

const props = withDefaults(defineProps<{
  data?: Record<string, unknown>
  metric?: string
  title?: string
}>(), {
  data: () => ({}),
  metric: 'height',
  title: '',
})

const chartEl = ref<HTMLElement | null>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chartInstance: any = null

const yAxisLabel = computed(() => {
  if (['height', 'head_circumference'].includes(props.metric)) return 'cm'
  if (props.metric === 'weight') return 'kg'
  return ''
})

const seriesName = computed(() => {
  const MAP: Record<string, string> = {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = (props.data?.[props.metric] as any[]) || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const points = rawData.slice().sort((a: any, b: any) =>
    a.x < b.x ? -1 : a.x > b.x ? 1 : 0
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xData = points.map((p: any) => p.x)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yData = points.map((p: any) => p.y)

  return {
    title: props.title
      ? { text: props.title, left: 'center', textStyle: { fontSize: 14 } }
      : undefined,
    tooltip: {
      trigger: 'axis',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
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
