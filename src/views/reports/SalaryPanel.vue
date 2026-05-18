<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard, getFinanceSummary } from '@/api/reports'
import { BarChart, MONTH_LABELS } from './chartSetup'
import { money } from '@/utils/format'
import { getUserInfo } from '@/utils/auth'
import SalaryContributorsDialog from './SalaryContributorsDialog.vue'
import type { ChartData, ChartOptions } from 'chart.js'

const props = defineProps<{
  year: number
}>()

const dashboard = useCachedAsync(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)
const finance = useCachedAsync(
  `reports/finance:${props.year}`,
  () => getFinanceSummary(props.year).then(r => r.data),
  { ttl: 300_000 }
)

watch(() => props.year, () => {
  dashboard.refresh(false)
  finance.refresh(false)
})

const data = computed(() => dashboard.data.value || { salary_monthly: [] })
const financeData = computed(() => finance.data.value)
const loading = computed(() =>
  (dashboard.pending.value && !dashboard.data.value) ||
  (finance.pending.value && !finance.data.value)
)

// canSeeAmount：admin/hr 看完整金額，其他 role 顯「—」（後端遮罩決定，前端僅 UI label 用）
const canSeeAmount = computed(() => {
  const info = getUserInfo()
  return info?.role === 'admin' || info?.role === 'hr'
})

// drill-down dialog state
const contribDialog = ref<{ visible: boolean; month: number | null }>({ visible: false, month: null })

function openContributors(monthIdx: number) {
  contribDialog.value = { visible: true, month: monthIdx + 1 }
}

const salaryChartData = computed(() => {
  const monthMap: Record<number, Record<string, number | null>> = {}
  ;(data.value.salary_monthly || []).forEach((d: Record<string, number>) => { monthMap[d.month] = d })
  const gross: (number | null)[] = []
  const net: (number | null)[] = []
  const bonus: (number | null)[] = []
  const ot: (number | null)[] = []
  for (let m = 1; m <= 12; m++) {
    const d = monthMap[m]
    gross.push(d ? d.total_gross as number : null)
    net.push(d ? d.total_net as number : null)
    bonus.push(d ? d.total_bonus as number : null)
    ot.push(d ? d.total_overtime_pay as number : null)
  }
  // Mixed bar+line chart: vue-chartjs Bar types don't cover `type: 'line'` in datasets — cast to unknown
  return {
    labels: MONTH_LABELS,
    datasets: [
      { label: '應發總額', data: gross, backgroundColor: 'rgba(64,158,255,0.6)', borderColor: '#409EFF', borderWidth: 1, borderRadius: 4, order: 3 },
      { label: '實發總額', data: net, type: 'line', borderColor: '#67C23A', backgroundColor: 'rgba(103,194,58,0.1)', fill: false, tension: 0.3, pointRadius: 4, order: 1 },
      { label: '獎金', data: bonus, type: 'line', borderColor: '#E6A23C', backgroundColor: 'rgba(230,162,60,0.1)', fill: false, tension: 0.3, borderDash: [5, 5], pointRadius: 3, order: 2 },
      { label: '加班費', data: ot, type: 'line', borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.1)', fill: false, tension: 0.3, borderDash: [3, 3], pointRadius: 3, order: 2 },
    ],
  } as unknown as ChartData<'bar', (number | null)[]>
})

const salaryChartOptions = computed(() => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const },
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label: string }; parsed: { y: number | null } }) =>
          `${ctx.dataset.label}: $${ctx.parsed.y ? ctx.parsed.y.toLocaleString() : 0}`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: '金額 (NTD)' },
      ticks: { callback: (val: number | string) => '$' + (Number(val) / 1000).toFixed(0) + 'k' },
    },
  },
  spanGaps: true,
  onClick: (_e: unknown, elements: Array<{ index: number }>) => {
    if (!elements.length) return
    openContributors(elements[0].index)
  },
})) as unknown as ChartOptions<'bar'>

const expenseCategories = computed(() => financeData.value?.expense_by_category || [])
const totalEmployerBenefit = computed(() => {
  const row = expenseCategories.value.find((c: Record<string, unknown>) => c.category === 'employer_benefit')
  return (row?.amount as number) || 0
})
const totalGross = computed(() => {
  const row = expenseCategories.value.find((c: Record<string, unknown>) => c.category === 'salary_gross')
  return (row?.amount as number) || 0
})
</script>

<template>
  <el-skeleton v-if="loading" :rows="8" animated />
  <div v-else>
    <el-card class="chart-card" shadow="hover">
      <template #header><span class="chart-title">薪資支出月度比較（點擊長條看 top 5 contributors）</span></template>
      <div class="chart-container chart-container--tall">
        <BarChart :data="salaryChartData" :options="salaryChartOptions" />
      </div>
    </el-card>

    <el-card v-if="financeData" class="chart-card" shadow="hover">
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

    <SalaryContributorsDialog
      v-model="contribDialog.visible"
      :year="year"
      :month="contribDialog.month || 1"
    />
  </div>
</template>

<style scoped>
.chart-card { margin-bottom: var(--space-4); }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-container { height: 320px; position: relative; cursor: pointer; }
.chart-container--tall { height: 380px; cursor: pointer; }
.kpi { text-align: center; padding: 12px 0; }
.kpi-label { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 6px; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.kpi-blue { color: #409EFF; }
.kpi-orange { color: var(--color-warning); }
</style>
