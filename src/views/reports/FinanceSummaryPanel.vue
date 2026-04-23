<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { LineChart, PieChart } from './chartSetup.js'
import FinanceDetailDialog from './FinanceDetailDialog.vue'
import { getFinanceSummary, financeSummaryExportUrl } from '@/api/reports'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'
import { downloadFile } from '@/utils/download'

const props = defineProps({
  year: { type: Number, required: true },
})

const loading = ref(false)
const exporting = ref(false)
const selectedMonth = ref(null)
const data = ref(null)

const detailVisible = ref(false)
const detailMonth = ref(null)

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getFinanceSummary(props.year, selectedMonth.value)
    data.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入收支資料失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => props.year, fetchData)
watch(selectedMonth, fetchData)
onMounted(fetchData)

const months = Array.from({ length: 12 }, (_, i) => i + 1)

const trendChartData = computed(() => {
  const trend = data.value?.monthly_trend || []
  const byMonth = {}
  trend.forEach(r => { byMonth[r.month] = r })
  const monthList = selectedMonth.value ? [selectedMonth.value] : months
  const labels = monthList.map(m => `${m}月`)
  const revenue = monthList.map(m => byMonth[m]?.revenue || 0)
  const refund = monthList.map(m => byMonth[m]?.refund || 0)
  const expense = monthList.map(m => byMonth[m]?.expense || 0)
  const net = monthList.map(m => byMonth[m]?.net || 0)
  return {
    labels,
    datasets: [
      { label: '收入', data: revenue, borderColor: '#67C23A', backgroundColor: 'rgba(103,194,58,0.1)', fill: true, tension: 0.3 },
      { label: '退款', data: refund, borderColor: '#E6A23C', backgroundColor: 'rgba(230,162,60,0.1)', borderDash: [4, 4], tension: 0.3 },
      { label: '支出', data: expense, borderColor: '#F56C6C', backgroundColor: 'rgba(245,108,108,0.1)', tension: 0.3 },
      { label: '淨現金', data: net, borderColor: '#409EFF', backgroundColor: 'rgba(64,158,255,0.1)', borderWidth: 3, tension: 0.3 },
    ],
  }
})

const trendChartOptions = {
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'top' },
    tooltip: {
      callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}` },
    },
  },
  scales: {
    y: { beginAtZero: false, ticks: { callback: (v) => '$' + (v / 1000).toFixed(0) + 'k' } },
  },
}

const revenuePieData = computed(() => {
  const cats = data.value?.revenue_by_category || []
  return {
    labels: cats.map(c => c.label),
    datasets: [{
      data: cats.map(c => c.amount),
      backgroundColor: ['#67C23A', '#409EFF', '#9B59B6', '#E6A23C'],
    }],
  }
})

const expensePieData = computed(() => {
  const cats = data.value?.expense_by_category || []
  return {
    labels: cats.map(c => c.label),
    datasets: [{
      data: cats.map(c => c.amount),
      backgroundColor: ['#F56C6C', '#E6A23C', '#909399', '#9B59B6'],
    }],
  }
})

const pieOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' },
    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.parsed)}` } },
  },
}

const trendTableData = computed(() => data.value?.monthly_trend || [])

const summary = computed(() => data.value?.summary || {
  total_revenue: 0, total_refund: 0, net_revenue: 0,
  total_expense: 0, net_cashflow: 0,
})

// MoM：比較當前系統月與上個月（僅在檢視整年時顯示；選某月時不顯示）
const currentMonth = new Date().getMonth() + 1
const mom = computed(() => {
  if (selectedMonth.value != null) return null
  const trend = data.value?.monthly_trend || []
  const curr = trend.find(r => r.month === currentMonth)
  const prev = trend.find(r => r.month === currentMonth - 1)
  if (!curr || !prev) return null
  const pct = (a, b) => (b ? ((a - b) / b) * 100 : null)
  return {
    revenue: pct(curr.revenue, prev.revenue),
    refund: pct(curr.refund, prev.refund),
    expense: pct(curr.expense, prev.expense),
    net: pct(curr.net, prev.net),
  }
})

const formatPct = (v) => {
  if (v == null || !Number.isFinite(v)) return null
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

const openMonthDetail = (m) => {
  detailMonth.value = m
  detailVisible.value = true
}

const exportXlsx = async () => {
  exporting.value = true
  try {
    const url = financeSummaryExportUrl(props.year, selectedMonth.value)
    const suffix = selectedMonth.value ? `${props.year}-${String(selectedMonth.value).padStart(2, '0')}` : `${props.year}-全年`
    await downloadFile(url, `收支彙總_${suffix}.xlsx`)
  } catch (e) {
    ElMessage.error(apiError(e, '匯出失敗'))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div v-loading="loading" class="finance-panel">
    <div class="controls">
      <el-select v-model="selectedMonth" clearable placeholder="整年" style="width: 140px;">
        <el-option v-for="m in months" :key="m" :label="`${m} 月`" :value="m" />
      </el-select>
      <span class="range-hint">
        {{ selectedMonth ? `檢視 ${year} 年 ${selectedMonth} 月` : `檢視 ${year} 年整年` }}
      </span>
      <div class="controls-spacer" />
      <el-button :icon="Download" :loading="exporting" @click="exportXlsx">匯出 Excel</el-button>
    </div>

    <el-row :gutter="16" class="summary-row">
      <el-col :xs="12" :sm="6">
        <el-card class="kpi kpi--green" shadow="hover">
          <div class="kpi-label">總收入</div>
          <div class="kpi-value value-green">{{ money(summary.total_revenue) }}</div>
          <div v-if="mom?.revenue != null" class="kpi-trend" :class="mom.revenue >= 0 ? 'up' : 'down'">
            {{ mom.revenue >= 0 ? '↑' : '↓' }} {{ formatPct(mom.revenue) }} <span class="kpi-trend-label">vs 上月</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="kpi kpi--orange" shadow="hover">
          <div class="kpi-label">退款</div>
          <div class="kpi-value value-orange">{{ money(summary.total_refund) }}</div>
          <div v-if="mom?.refund != null" class="kpi-trend" :class="mom.refund >= 0 ? 'up-warn' : 'down-good'">
            {{ mom.refund >= 0 ? '↑' : '↓' }} {{ formatPct(mom.refund) }} <span class="kpi-trend-label">vs 上月</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="kpi kpi--red" shadow="hover">
          <div class="kpi-label">總支出</div>
          <div class="kpi-value value-red">{{ money(summary.total_expense) }}</div>
          <div v-if="mom?.expense != null" class="kpi-trend" :class="mom.expense >= 0 ? 'up-warn' : 'down-good'">
            {{ mom.expense >= 0 ? '↑' : '↓' }} {{ formatPct(mom.expense) }} <span class="kpi-trend-label">vs 上月</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="kpi kpi--blue" shadow="hover">
          <div class="kpi-label">淨現金</div>
          <div class="kpi-value">{{ money(summary.net_cashflow) }}</div>
          <div v-if="mom?.net != null" class="kpi-trend" :class="mom.net >= 0 ? 'up' : 'down'">
            {{ mom.net >= 0 ? '↑' : '↓' }} {{ formatPct(mom.net) }} <span class="kpi-trend-label">vs 上月</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="chart-card" shadow="hover">
      <template #header><span class="chart-title">月度收支趨勢</span></template>
      <div class="chart-container chart-container--tall">
        <LineChart :data="trendChartData" :options="trendChartOptions" />
      </div>
    </el-card>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header><span class="chart-title">收入分類</span></template>
          <div class="chart-container">
            <PieChart v-if="(data?.revenue_by_category || []).some(c => c.amount > 0)" :data="revenuePieData" :options="pieOptions" />
            <el-empty v-else description="無收入資料" :image-size="60" />
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header><span class="chart-title">支出分類</span></template>
          <div class="chart-container">
            <PieChart v-if="(data?.expense_by_category || []).some(c => c.amount > 0)" :data="expensePieData" :options="pieOptions" />
            <el-empty v-else description="無支出資料" :image-size="60" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="chart-card" shadow="hover">
      <template #header>
        <span class="chart-title">月度明細</span>
        <span class="chart-hint">點擊金額可查看該月原始交易</span>
      </template>
      <el-table :data="trendTableData" border stripe size="small">
        <el-table-column prop="month" label="月" width="70">
          <template #default="{ row }">{{ row.month }} 月</template>
        </el-table-column>
        <el-table-column label="收入" align="right">
          <template #default="{ row }">
            <button type="button" class="link-btn" @click="openMonthDetail(row.month)">{{ money(row.revenue) }}</button>
          </template>
        </el-table-column>
        <el-table-column label="退款" align="right">
          <template #default="{ row }">
            <button type="button" class="link-btn" @click="openMonthDetail(row.month)">{{ money(row.refund) }}</button>
          </template>
        </el-table-column>
        <el-table-column label="支出" align="right">
          <template #default="{ row }">
            <button type="button" class="link-btn" @click="openMonthDetail(row.month)">{{ money(row.expense) }}</button>
          </template>
        </el-table-column>
        <el-table-column label="淨現金" align="right">
          <template #default="{ row }">
            <span :class="{ 'value-red': row.net < 0, 'value-green': row.net > 0 }">
              {{ money(row.net) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <FinanceDetailDialog
      v-model="detailVisible"
      :year="year"
      :month="detailMonth"
    />
  </div>
</template>

<style scoped>
.controls {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: var(--space-4);
}
.controls-spacer { flex: 1; }
.range-hint { color: var(--text-secondary); font-size: 13px; }
.summary-row { margin-bottom: var(--space-4); }
.kpi {
  text-align: center; padding: 12px 0 10px;
  border-top: 3px solid transparent;
}
.kpi--green  { border-top-color: var(--color-success); }
.kpi--orange { border-top-color: var(--color-warning); }
.kpi--red    { border-top-color: var(--color-danger); }
.kpi--blue   { border-top-color: #409EFF; }
.kpi-label { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: 6px; }
.kpi-value { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.kpi-trend { font-size: 12px; font-weight: 600; margin-top: 4px; }
.kpi-trend.up,
.kpi-trend.down-good { color: var(--color-success); }
.kpi-trend.down,
.kpi-trend.up-warn   { color: var(--color-danger); }
.kpi-trend-label { font-weight: normal; color: var(--text-secondary); margin-left: 4px; }

.chart-card { margin-bottom: var(--space-4); }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-hint { font-size: 12px; color: var(--text-secondary); margin-left: 12px; font-weight: normal; }
.chart-container { height: 320px; position: relative; }
.chart-container--tall { height: 380px; }
.value-green { color: var(--color-success); }
.value-orange { color: var(--color-warning); }
.value-red { color: var(--color-danger); }

.link-btn {
  background: none; border: none; padding: 0;
  color: #409EFF; cursor: pointer; font: inherit;
}
.link-btn:hover { text-decoration: underline; }
</style>
