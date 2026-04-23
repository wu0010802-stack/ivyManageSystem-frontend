<script setup>
import { computed } from 'vue'
import { BarChart, MONTH_LABELS } from './chartSetup.js'
import { money } from '@/utils/format'

const props = defineProps({
  data: {
    type: Object,
    default: () => ({ salary_monthly: [] }),
  },
  finance: {
    type: Object,
    default: () => null,
  },
})

const salaryChartData = computed(() => {
  const monthMap = {}
  ;(props.data.salary_monthly || []).forEach(d => { monthMap[d.month] = d })
  const gross = [], net = [], bonus = [], ot = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    gross.push(d ? d.total_gross : null)
    net.push(d ? d.total_net : null)
    bonus.push(d ? d.total_bonus : null)
    ot.push(d ? d.total_overtime_pay : null)
  }
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '應發總額', data: gross, backgroundColor: 'rgba(64,158,255,0.6)', borderColor: '#409EFF', borderWidth: 1, borderRadius: 4, order: 3 },
      { label: '實發總額', data: net, type: 'line', borderColor: '#67C23A', backgroundColor: 'rgba(103,194,58,0.1)', fill: false, tension: 0.3, pointRadius: 4, order: 1 },
      { label: '獎金', data: bonus, type: 'line', borderColor: '#E6A23C', backgroundColor: 'rgba(230,162,60,0.1)', fill: false, tension: 0.3, borderDash: [5, 5], pointRadius: 3, order: 2 },
      { label: '加班費', data: ot, type: 'line', borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.1)', fill: false, tension: 0.3, borderDash: [3, 3], pointRadius: 3, order: 2 },
    ],
  }
})

const salaryChartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y ? ctx.parsed.y.toLocaleString() : 0}`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: '金額 (NTD)' },
      ticks: { callback: (val) => '$' + (val / 1000).toFixed(0) + 'k' },
    },
  },
  spanGaps: true,
}

const expenseCategories = computed(() => {
  return props.finance?.expense_by_category || []
})

const totalEmployerBenefit = computed(() => {
  const row = expenseCategories.value.find(c => c.category === 'employer_benefit')
  return row?.amount || 0
})

const totalGross = computed(() => {
  const row = expenseCategories.value.find(c => c.category === 'salary_gross')
  return row?.amount || 0
})
</script>

<template>
  <div>
    <el-card class="chart-card" shadow="hover">
      <template #header><span class="chart-title">薪資支出月度比較</span></template>
      <div class="chart-container chart-container--tall">
        <BarChart :data="salaryChartData" :options="salaryChartOptions" />
      </div>
    </el-card>

    <el-card v-if="finance" class="chart-card" shadow="hover">
      <template #header><span class="chart-title">園方人事成本（本年彙總）</span></template>
      <el-row :gutter="16">
        <el-col :xs="12" :sm="8">
          <div class="kpi">
            <div class="kpi-label">員工應發</div>
            <div class="kpi-value">{{ money(totalGross) }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8">
          <div class="kpi">
            <div class="kpi-label">雇主保費+勞退</div>
            <div class="kpi-value kpi-orange">{{ money(totalEmployerBenefit) }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="8">
          <div class="kpi">
            <div class="kpi-label">園方真實支出</div>
            <div class="kpi-value kpi-blue">{{ money(totalGross + totalEmployerBenefit) }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<style scoped>
.chart-card { margin-bottom: var(--space-4); }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-container { height: 320px; position: relative; }
.chart-container--tall { height: 380px; }
.kpi { text-align: center; padding: 12px 0; }
.kpi-label { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 6px; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.kpi-blue { color: #409EFF; }
.kpi-orange { color: var(--color-warning); }
</style>
