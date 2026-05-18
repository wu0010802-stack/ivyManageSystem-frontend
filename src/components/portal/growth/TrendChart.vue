<script setup>
import { computed } from 'vue'
import { LineChart } from '@/views/reports/chartSetup'

const props = defineProps({
  points: { type: Array, required: true },
})

const chartData = computed(() => ({
  labels: props.points.map((p) => p.label),
  datasets: [
    {
      label: '總分',
      data: props.points.map((p) => Number(p.total_score)),
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37,99,235,0.08)',
      tension: 0.25,
      fill: true,
      pointRadius: 5,
      pointHoverRadius: 7,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      min: 0,
      max: 100,
      ticks: { stepSize: 10 },
      grid: {
        color: (ctx) => {
          // 等第帶：90/80/70/60 加深
          if ([60, 70, 80, 90].includes(ctx.tick.value)) return '#9ca3af'
          return '#e5e7eb'
        },
      },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: { mode: 'index', intersect: false },
  },
}
</script>

<template>
  <div class="trend-chart-wrap">
    <LineChart :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.trend-chart-wrap { height: 240px; }
</style>
