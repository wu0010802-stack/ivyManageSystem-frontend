<script setup lang="ts">
import { computed } from 'vue'
import type { ChartData, ChartOptions } from 'chart.js'
import { LineChart } from '@/composables/useChartJs'

const props = withDefaults(defineProps<{
  data?: Record<string, unknown>
  metric?: string
  title?: string
}>(), {
  data: () => ({}),
  metric: 'height',
  title: '',
})

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

interface Point { x: string; y: number | string }

const sortedPoints = computed<Point[]>(() => {
  const raw = (props.data?.[props.metric] as Point[] | undefined) || []
  return raw.slice().sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0))
})

const isEmpty = computed(() => sortedPoints.value.length === 0)

const chartData = computed<ChartData<'line', (number | null)[]>>(() => ({
  labels: sortedPoints.value.map(p => p.x),
  datasets: [
    {
      label: seriesName.value,
      data: sortedPoints.value.map(p => {
        const n = Number(p.y)
        return Number.isFinite(n) ? n : null
      }),
      borderColor: '#0d9053',
      backgroundColor: '#0d9053',
      borderWidth: 2,
      tension: 0.3,
      pointStyle: 'circle',
      pointRadius: 7,
      pointBackgroundColor: '#0d9053',
      pointBorderColor: '#0d9053',
      fill: false,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: {
    padding: {
      top: props.title ? 8 : 4,
      left: 4,
      right: 8,
      bottom: 4,
    },
  },
  plugins: {
    legend: { display: false },
    title: props.title
      ? { display: true, text: props.title, font: { size: 14 } }
      : { display: false },
    tooltip: {
      callbacks: {
        title: (items) => items[0]?.label ?? '',
        label: (ctx) => `${seriesName.value}：${ctx.parsed.y}`,
      },
    },
  },
  scales: {
    x: {
      type: 'category',
      ticks: {
        maxRotation: 30,
        minRotation: 30,
        font: { size: 11 },
      },
    },
    y: {
      type: 'linear',
      title: {
        display: !!yAxisLabel.value,
        text: yAxisLabel.value,
        font: { size: 12 },
      },
      ticks: { font: { size: 11 } },
    },
  },
}))
</script>

<template>
  <div class="measurement-chart-wrap">
    <LineChart
      v-if="!isEmpty"
      :data="chartData"
      :options="chartOptions"
      class="measurement-chart"
    />
    <div v-else class="measurement-chart-empty">尚無 {{ seriesName }} 紀錄</div>
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
