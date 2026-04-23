<script setup>
import { computed } from 'vue'
import { LineChart, BarChart, MONTH_LABELS } from './chartSetup.js'

const props = defineProps({
  data: {
    type: Object,
    default: () => ({
      attendance_monthly: [],
      attendance_by_classroom: [],
      leave_monthly: [],
    }),
  },
})

const attendanceChartData = computed(() => {
  const monthMap = {}
  props.data.attendance_monthly.forEach(d => { monthMap[d.month] = d })
  const rates = [], late = [], early = [], miss = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    rates.push(d ? d.rate : null)
    late.push(d ? d.late : null)
    early.push(d ? d.early_leave : null)
    miss.push(d ? d.missing : null)
  }
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '出勤率 (%)', data: rates, borderColor: '#409EFF', backgroundColor: 'rgba(64,158,255,0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
      { label: '遲到次數', data: late, borderColor: '#E6A23C', backgroundColor: 'rgba(230,162,60,0.1)', borderDash: [5, 5], tension: 0.3, yAxisID: 'y1' },
      { label: '早退次數', data: early, borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.1)', borderDash: [4, 4], tension: 0.3, yAxisID: 'y1' },
      { label: '缺卡次數', data: miss, borderColor: '#F56C6C', backgroundColor: 'rgba(245,108,108,0.1)', borderDash: [3, 3], tension: 0.3, yAxisID: 'y1' },
    ],
  }
})

const attendanceChartOptions = {
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { position: 'top' }, title: { display: false } },
  scales: {
    y: { type: 'linear', position: 'left', min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } },
    y1: { type: 'linear', position: 'right', min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: '次數' } },
  },
  spanGaps: true,
}

const classroomChartData = computed(() => {
  const data = props.data.attendance_by_classroom || []
  const labels = data.map(d => d.classroom)
  const rates = data.map(d => d.rate)
  const colors = rates.map(r => r >= 95 ? '#67C23A' : r >= 90 ? '#E6A23C' : '#F56C6C')
  return { labels, datasets: [{ label: '出勤率 (%)', data: rates, backgroundColor: colors, borderRadius: 4 }] }
})

const classroomChartOptions = {
  responsive: true, maintainAspectRatio: false, indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: { x: { min: 0, max: 100, title: { display: true, text: '出勤率 (%)' } } },
}

const leaveChartData = computed(() => {
  const data = props.data.leave_monthly || []
  const personal = data.map(d => d.personal || 0)
  const sick = data.map(d => d.sick || 0)
  const annual = data.map(d => d.annual || 0)
  const other = data.map(d => (d.menstrual || 0) + (d.maternity || 0) + (d.paternity || 0))
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '事假', data: personal, backgroundColor: '#E6A23C', stack: 'leaves' },
      { label: '病假', data: sick, backgroundColor: '#409EFF', stack: 'leaves' },
      { label: '特休', data: annual, backgroundColor: '#67C23A', stack: 'leaves' },
      { label: '其他', data: other, backgroundColor: '#909399', stack: 'leaves' },
    ],
  }
})

const leaveChartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'top' } },
  scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: '次數' } } },
}
</script>

<template>
  <el-row :gutter="16">
    <el-col :xs="24" :lg="12">
      <el-card class="chart-card" shadow="hover">
        <template #header><span class="chart-title">月度出勤率趨勢</span></template>
        <div class="chart-container"><LineChart :data="attendanceChartData" :options="attendanceChartOptions" /></div>
      </el-card>
    </el-col>
    <el-col :xs="24" :lg="12">
      <el-card class="chart-card" shadow="hover">
        <template #header><span class="chart-title">各班級出勤統計</span></template>
        <div class="chart-container">
          <BarChart v-if="data.attendance_by_classroom?.length" :data="classroomChartData" :options="classroomChartOptions" />
          <el-empty v-else description="無班級出勤資料" :image-size="60" />
        </div>
      </el-card>
    </el-col>
    <el-col :xs="24" :lg="12">
      <el-card class="chart-card" shadow="hover">
        <template #header><span class="chart-title">請假趨勢分析</span></template>
        <div class="chart-container"><BarChart :data="leaveChartData" :options="leaveChartOptions" /></div>
      </el-card>
    </el-col>
  </el-row>
</template>

<style scoped>
.chart-card { margin-bottom: var(--space-4); }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-container { height: 320px; position: relative; }
</style>
