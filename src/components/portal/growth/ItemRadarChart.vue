<script setup>
import { computed } from 'vue'
import { RadarChart } from '@/views/reports/chartSetup'

const props = defineProps({
  items: { type: Array, required: true },
})

const chartData = computed(() => {
  const sorted = [...props.items].sort(
    (a, b) => a.display_order - b.display_order,
  )
  return {
    labels: sorted.map((it) => it.label),
    datasets: [
      {
        label: '加減分絕對值',
        data: sorted.map((it) => Math.abs(Number(it.score_delta))),
        backgroundColor: 'rgba(37,99,235,0.18)',
        borderColor: '#2563eb',
        pointBackgroundColor: sorted.map((it) =>
          Number(it.score_delta) >= 0 ? '#1e7e34' : '#b91c1c',
        ),
        pointRadius: 4,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    r: { beginAtZero: true, ticks: { display: false } },
  },
  plugins: { legend: { display: false } },
}
</script>

<template>
  <div v-if="items.length" class="radar-wrap">
    <RadarChart :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.radar-wrap { height: 280px; }
</style>
