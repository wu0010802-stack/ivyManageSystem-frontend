<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { LineChart } from './chartSetup'
import FinanceDetailDialog from './FinanceDetailDialog.vue'
import ReportKpiCard from './ReportKpiCard.vue'
import CategoryBarList from './CategoryBarList.vue'
import { getFinanceSummary, financeSummaryExportUrl } from '@/api/reports'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { apiError } from '@/utils/error'
import { money } from '@/utils/format'
import { downloadFile } from '@/utils/download'
import { computeReportPeriod } from './useReportPeriod'
import { buildTrendChartData, inProgressIndex } from './trendChart'
import { sumTrendUpTo, futurePreloggedExpense, pctChange, type FinanceTrendRow } from './financeTrend'
import type { ChartOptions } from 'chart.js'

const props = defineProps<{
  year: number
  initialMonth?: number | null
}>()

const exporting = ref(false)
const selectedMonth = ref<number | null>(props.initialMonth ?? null)
const errorMsg = ref('')

const detailVisible = ref(false)
const detailMonth = ref<number | null>(null)

// 雙軌策略：
// - selectedMonth === null：走 useCachedAsync，cache key 與 OverviewPanel/SalaryPanel
//   共用（reports/finance:${year}），切 tab 命中
// - selectedMonth 有值：直接 axios，不寫入共用 cache（避免污染年級 cache：
//   useCachedAsync 的 key 在 instance 建立時固定，若 refresh() 帶 month 結果會
//   蓋到 reports/finance:${year} 條目，導致 Overview/Salary 拿到月資料而非全年）
const yearLevel = useCachedAsync(
  `reports/finance:${props.year}`,
  () => getFinanceSummary(props.year).then(r => r.data),
  { ttl: 300_000, immediate: false }
)
const monthData = ref<unknown>(null)
const monthLoading = ref(false)

async function loadData() {
  errorMsg.value = ''
  if (selectedMonth.value == null) {
    // 注意：useCachedAsync.refresh() 內部把 fetcher 的 reject 吞掉（只更新
    // error ref，外層 `await promise` 的 catch 直接 return data.value，不 re-throw）
    // ——`await yearLevel.refresh(false)` 永遠不會丟出例外，包在這裡的 try/catch
    // 曾是 dead code（2026-07-05 補錯誤狀態時發現）。改讀 yearLevel.error 本身。
    await yearLevel.refresh(false)
    if (yearLevel.error.value) {
      // 有舊快取時 refresh() 會保留 stale data（SWR），僅在真的沒有任何資料可顯示
      // 時才需要持久性錯誤畫面；見下方 template 的 `errorMsg && !data` 判斷。
      errorMsg.value = apiError(yearLevel.error.value, '載入收支資料失敗')
      ElMessage.error(errorMsg.value)
    }
  } else {
    monthLoading.value = true
    monthData.value = null
    try {
      const res = await getFinanceSummary(props.year, selectedMonth.value)
      monthData.value = res.data
    } catch (e) {
      errorMsg.value = apiError(e, '載入收支資料失敗')
      ElMessage.error(errorMsg.value)
    } finally {
      monthLoading.value = false
    }
  }
}

watch([() => props.year, selectedMonth], loadData, { immediate: true })

const data = computed(() =>
  selectedMonth.value == null ? yearLevel.data.value : monthData.value
)
const loading = computed(() => {
  const hasData = data.value != null
  if (selectedMonth.value == null) return yearLevel.pending.value && !hasData
  return monthLoading.value && !hasData
})

const months = Array.from({ length: 12 }, (_, i) => i + 1)

// 報表模組「資料截止月」單一事實來源（spec §2）；僅整年模式有意義（單月模式下
// cutoff/lastActual 與截斷邏輯不適用，圖表與明細各自走既有單點/未截斷路徑）。
const trend = computed<FinanceTrendRow[]>(() => data.value?.monthly_trend || [])
const period = computed(() => computeReportPeriod(props.year, trend.value))

// 整年模式 KPI 主數字：截至實際發生口徑（取代後端 summary 全年口徑——全年口徑含
// 未來月預登錄固定支出，會讓「本年總支出」在年中就跳成年底金額）；單月模式沿用 summary。
const actuals = computed(() => sumTrendUpTo(trend.value, period.value.cutoffMonth))
// afterMonth 統一用 cutoffMonth（與 actuals 加總邊界一致，OverviewPanel 同款；
// 2026-07-11 review F4：舊版用 lastActualMonth 會在「cutoff 內最後一月尚無資料」
// 時把 cutoff 內的空月也算進「未來預登錄」區間，口徑與 actuals 不對齊）。
const prelogged = computed(() => futurePreloggedExpense(trend.value, period.value.cutoffMonth))
const expenseNote = computed(() =>
  selectedMonth.value == null && prelogged.value.total > 0
    ? `全年含預登錄：${money(summary.value.total_expense)}` : undefined)
const netNote = computed(() =>
  selectedMonth.value == null && prelogged.value.total > 0
    ? `全年口徑：${money(summary.value.net_cashflow)}` : undefined)

// 趨勢圖：整年模式走共用 builder（含退款線＋cutoff 截斷＋進行中月標示，同
// OverviewPanel）；單月模式維持既有單點組法（builder 是年度視角，不適用單月）。
const trendChartData = computed(() => {
  if (selectedMonth.value == null) {
    return buildTrendChartData(trend.value, period.value, { includeRefund: true })
  }
  const byMonth: Record<number, FinanceTrendRow> = {}
  trend.value.forEach((r) => { byMonth[r.month] = r })
  const monthList = [selectedMonth.value]
  const labels = monthList.map(m => `${m}月`)
  const revenue = monthList.map(m => byMonth[m]?.revenue || 0)
  const refund = monthList.map(m => byMonth[m]?.refund || 0)
  const expense = monthList.map(m => byMonth[m]?.expense || 0)
  const net = monthList.map(m => byMonth[m]?.net || 0)
  return {
    labels,
    datasets: [
      { label: '收入', data: revenue, borderColor: '#67c23a', backgroundColor: 'rgba(103,194,58,0.1)', fill: true, tension: 0.3 },
      { label: '退款', data: refund, borderColor: '#e6a23c', backgroundColor: 'rgba(230,162,60,0.1)', borderDash: [4, 4], tension: 0.3 },
      { label: '支出', data: expense, borderColor: '#f56c6c', backgroundColor: 'rgba(245,108,108,0.1)', tension: 0.3 },
      { label: '淨現金', data: net, borderColor: '#409eff', backgroundColor: 'rgba(64,158,255,0.1)', borderWidth: 3, tension: 0.3 },
    ],
  }
})

const trendChartOptions = {
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { position: 'top' as const },
    tooltip: {
      callbacks: {
        title: (items: Array<{ label: string; dataIndex: number }>) => {
          const idx = inProgressIndex(period.value)
          const base = items[0]?.label ?? ''
          return idx != null && items[0]?.dataIndex === idx ? `${base}（本月進行中）` : base
        },
        label: (ctx: { dataset: { label: string }; parsed: { y: number } }) =>
          `${ctx.dataset.label}: ${money(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    y: { beginAtZero: false, ticks: { callback: (v: number | string) => '$' + (Number(v) / 1000).toFixed(0) + 'k' } },
  },
} as unknown as ChartOptions<'line'>

// 月度明細：整年模式只列到 lastActualMonth（消除未來月「假紅字」列，配合表尾
// 預登錄固定支出說明另行揭露）；單月模式維持原樣（單一列）。
const trendTableData = computed(() => {
  const rows = trend.value
  if (selectedMonth.value != null) return rows
  const last = period.value.lastActualMonth ?? 0
  return rows.filter((r: FinanceTrendRow) => r.month <= last)
})

const summary = computed(() => data.value?.summary || {
  total_revenue: 0, total_refund: 0, net_revenue: 0,
  total_expense: 0, net_cashflow: 0,
})

// MoM：錨定「最後完整月」（進行中的當月不當錨點；預登錄月被 cutoff 夾住不會拉高
// 錨點），僅在檢視整年時顯示；選某月時不顯示（取代舊版直接錨定 lastMonthWithData
// 的 bug，見 useReportPeriod.ts／financeTrend.ts 註解）。
const mom = computed(() => {
  if (selectedMonth.value != null) return null
  const anchor = period.value.lastCompleteMonth
  if (anchor == null) return null
  const curr = trend.value.find(r => r.month === anchor)
  const prev = trend.value.find(r => r.month === anchor - 1)
  if (!curr || !prev) return null
  return {
    revenue: pctChange(curr.revenue, prev.revenue),
    refund: pctChange(curr.refund, prev.refund),
    expense: pctChange(curr.expense, prev.expense),
    net: pctChange(curr.net, prev.net),
  }
})

type CategoryRow = { label: string; amount: number }
const hasRevenue = computed(() =>
  ((data.value as Record<string, CategoryRow[]> | null)?.revenue_by_category || []).some(c => c.amount > 0)
)
const hasExpense = computed(() =>
  ((data.value as Record<string, CategoryRow[]> | null)?.expense_by_category || []).some(c => c.amount > 0)
)

const openMonthDetail = (m: number) => {
  detailMonth.value = m
  detailVisible.value = true
}

// el-select clearable 陷阱（memory feedback_elselect_clear_undefined_json_drops_field
// 的防禦比照套用）：clearable 清空時 ElSelect 對 change/update:modelValue 都是送
// `undefined` 非 `null`；用 :model-value + @change 明確正規化，避免 selectedMonth
// 落入 `undefined`（此處雖是本地 state 非 API body，不會直接 JSON.stringify 掉欄位，
// 但 `undefined` 混進 number|null 型別仍是型別不乾淨的來源，一律正規化）。
function onMonthChange(val: number | undefined) {
  selectedMonth.value = val ?? null
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
  <el-skeleton v-if="loading" :rows="10" animated />
  <div v-else-if="errorMsg && !data" class="finance-error">
    <el-empty :description="errorMsg" />
  </div>
  <div v-else class="finance-panel">
    <div class="controls">
      <el-select :model-value="selectedMonth" clearable placeholder="整年" style="width: 140px;" @change="onMonthChange">
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
        <ReportKpiCard
          label="總收入" accent="green" value-class="value-green"
          :value="money(selectedMonth == null ? actuals.revenue : summary.total_revenue)"
          value-test="kpi-total-revenue"
          :trends="[{ label: 'vs 上月', delta: mom?.revenue ?? null, test: 'mom-revenue' }]"
        />
      </el-col>
      <el-col :xs="12" :sm="6">
        <ReportKpiCard
          label="退款" accent="orange" value-class="value-orange"
          :value="money(selectedMonth == null ? actuals.refund : summary.total_refund)"
          value-test="kpi-total-refund"
          :trends="[{ label: 'vs 上月', delta: mom?.refund ?? null, invert: true, test: 'mom-refund' }]"
        />
      </el-col>
      <el-col :xs="12" :sm="6">
        <ReportKpiCard
          label="總支出" accent="red" value-class="value-red"
          :value="money(selectedMonth == null ? actuals.expense : summary.total_expense)"
          value-test="kpi-total-expense"
          :trends="[{ label: 'vs 上月', delta: mom?.expense ?? null, invert: true, test: 'mom-expense' }]"
          :note="expenseNote" note-test="kpi-expense-note"
        />
      </el-col>
      <el-col :xs="12" :sm="6">
        <ReportKpiCard
          label="淨現金" accent="blue"
          :value="money(selectedMonth == null ? actuals.net : summary.net_cashflow)"
          value-test="kpi-net-cashflow"
          :trends="[{ label: 'vs 上月', delta: mom?.net ?? null, test: 'mom-net' }]"
          :note="netNote" note-test="kpi-net-note"
        />
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
          <CategoryBarList
            v-if="hasRevenue"
            :items="data.revenue_by_category"
            :colors="['#67c23a', '#409eff', '#9b59b6', '#e6a23c']"
          />
          <el-empty v-else description="無收入資料" :image-size="60" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card" shadow="hover">
          <template #header><span class="chart-title">支出分類</span></template>
          <CategoryBarList
            v-if="hasExpense"
            :items="data.expense_by_category"
            :colors="['#f56c6c', '#e6a23c', '#909399', '#9b59b6']"
          />
          <el-empty v-else description="無支出資料" :image-size="60" />
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
      <div
        v-if="selectedMonth == null && prelogged.total > 0"
        class="prelogged-note"
        data-test="prelogged-note"
      >
        {{ prelogged.months[0] }}–{{ prelogged.months[prelogged.months.length - 1] }} 月已預登錄固定支出共
        {{ money(prelogged.total) }}，於「現金收支表」分頁檢視
      </div>
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

.chart-card { margin-bottom: var(--space-4); }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.chart-hint { font-size: 12px; color: var(--text-secondary); margin-left: 12px; font-weight: normal; }
.chart-container { height: 320px; position: relative; }
.chart-container--tall { height: 380px; }
/* 僅供本檔 template 直接渲染的節點（月度明細淨現金欄）使用；KPI 卡的語意色由
   ReportKpiCard 自己的 style 定義（父層 scoped 規則打不進子元件內部節點）。 */
.value-green { color: var(--color-success); }
.value-red { color: var(--color-danger); }

.link-btn {
  background: none; border: none; padding: 0;
  color: var(--color-info); cursor: pointer; font: inherit;
}
.link-btn:hover { text-decoration: underline; }

.prelogged-note { font-size: 12px; color: var(--text-secondary); padding: 8px 4px 0; }

.finance-error { padding: 32px 0; }
</style>
