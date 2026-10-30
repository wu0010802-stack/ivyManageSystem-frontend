<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard, getFinanceSummary, getSalaryContributors } from '@/api/reports'
import { BarChart, MONTH_LABELS } from '@/composables/useChartJs'
import { money } from '@/utils/format'
import { apiError } from '@/utils/error'
import { computeReportPeriod, monthState } from './useReportPeriod'
import { formatAmount, formatWan, monthRangeText } from './reportFormat'
import { readCssVar, resolveTrendPalette, withAlpha } from './trendChart'
import type { components } from '@/api/_generated/schema'
import type { ChartData, ChartOptions } from 'chart.js'

type SalaryMonthRow = components['schemas']['ReportsSalaryMonthlyItemOut']
type SalaryContributors = components['schemas']['ReportsSalaryContributorsOut']

const props = defineProps<{
  year: number
  /** 全模組共用的月份焦點（1–12）；改變時不重掛，由本元件自己反應 */
  focusMonth: number
}>()
const emit = defineEmits<{
  (e: 'update:focusMonth', month: number): void
  (e: 'navigate', payload: { tab: string }): void
}>()

// key 用 getter：year 改變時 refresh 才會打到新 key（殼層雖以 :key="year" 重掛，這裡仍保持自洽）
const dashboard = useCachedAsync(
  () => `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)
const finance = useCachedAsync(
  () => `reports/finance:${props.year}`,
  () => getFinanceSummary(props.year).then(r => r.data),
  { ttl: 300_000 }
)

watch(() => props.year, () => {
  dashboard.refresh(false)
  finance.refresh(false)
})

const loading = computed(() =>
  (dashboard.pending.value && !dashboard.data.value) ||
  (finance.pending.value && !finance.data.value)
)
// 沒有舊資料可顯示才算失敗；有快取時背景刷新失敗不蓋掉畫面
const dashboardFailed = computed(() => !!dashboard.error.value && !dashboard.data.value)
const dashboardErrorText = computed(() => apiError(dashboard.error.value, '載入薪資資料失敗'))
const financeData = computed(() => finance.data.value)
const financeError = computed(() => finance.error.value)
const financeErrorText = computed(() => apiError(finance.error.value, '載入年度累計失敗'))

function reload() {
  dashboard.refresh(true)
  if (!finance.data.value) finance.refresh(true)
}

const period = computed(() => computeReportPeriod(props.year))

// ───────── 每月應發與實發（人事成本＝應發＋雇主負擔，見下方年度累計）─────────

const rows = computed<SalaryMonthRow[]>(() => dashboard.data.value?.salary_monthly ?? [])
const byMonth = computed(() => new Map(rows.value.map(r => [r.month, r])))
// employee_count＝已封存且不需重算的人數；草稿／待重算另算在 employee_count_pending
const isSealed = (m: number) => (byMonth.value.get(m)?.employee_count ?? 0) > 0
const hasSealed = computed(() => rows.value.some(r => r.employee_count > 0))

// 只畫「已過且已封存」的月份；未封存（資料為 null，不畫 0）、本月、未來月都留白
const chartRows = computed(() =>
  MONTH_LABELS.map((_, i) => {
    const m = i + 1
    return monthState(period.value, m) === 'past' && isSealed(m) ? byMonth.value.get(m)! : null
  })
)

const salaryChartData = computed(() => {
  // canvas 吃不到 CSS 變數，繪圖前先把 token 解析成實色
  const pal = resolveTrendPalette()
  const barColor = pal.net
  const lineColor = readCssVar('--text-primary').trim() || pal.net
  const pointFill = readCssVar('--surface-color').trim() || lineColor
  // 焦點月實色、其他月份淡化，一眼看出下方前 5 名對應哪個月
  const barBackground = MONTH_LABELS.map((_, i) =>
    i + 1 === props.focusMonth ? barColor : withAlpha(barColor, 0.55)
  )
  // Mixed bar+line chart: vue-chartjs Bar types don't cover `type: 'line'` in datasets — cast to unknown
  return {
    labels: MONTH_LABELS,
    datasets: [
      {
        type: 'bar', label: '應發總額', data: chartRows.value.map(r => (r ? r.total_gross : null)),
        backgroundColor: barBackground, borderWidth: 0, borderRadius: 4, maxBarThickness: 40, order: 2,
      },
      {
        // tension 0：月度加總是離散值，平滑曲線會在兩月之間造出不存在的起伏
        type: 'line', label: '實發總額', data: chartRows.value.map(r => (r ? r.total_net : null)),
        borderColor: lineColor, backgroundColor: lineColor, borderWidth: 2,
        pointRadius: 4, pointBackgroundColor: pointFill, pointBorderColor: lineColor,
        tension: 0, spanGaps: false, order: 1,
      },
    ],
  } as unknown as ChartData<'bar', (number | null)[]>
})

const salaryChartOptions = computed(() => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const },
    tooltip: {
      // 同一個月的應發與實發放進同一個 tooltip
      mode: 'index' as const,
      intersect: false,
      callbacks: {
        label: (ctx: { dataset: { label: string }; parsed: { y: number | null } }) =>
          `${ctx.dataset.label}：${money(ctx.parsed.y ?? 0)}`,
        // 獎金合計已計入應發總額中（非額外加項），afterBody 補充該月獎金／加班費明細，
        // 並保留「不可與應發相加」警語（2026-07-05 報表重構，任務項 6）。
        afterBody: (items: Array<{ dataIndex: number }>) => {
          const m = (items[0]?.dataIndex ?? 0) + 1
          const d = byMonth.value.get(m)
          if (!d || !isSealed(m)) return []
          return [
            `獎金合計：${money(d.total_bonus || 0)}（已計入應發總額，不可與應發相加）`,
            `加班費：${money(d.total_overtime_pay || 0)}`,
          ]
        },
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { callback: (val: number | string) => formatWan(val) },
    },
  },
  // 點長條＝切換全模組的月份焦點（取代原本的彈窗）
  onClick: (_e: unknown, elements: Array<{ index: number }>) => {
    if (!elements.length) return
    emit('update:focusMonth', elements[0].index + 1)
  },
  onHover: (e: { native?: Event | null }, elements: unknown[]) => {
    const target = e.native?.target as HTMLElement | null | undefined
    if (target) target.style.cursor = elements.length ? 'pointer' : 'default'
  },
})) as unknown as ChartOptions<'bar'>

const chartAriaLabel = computed(() => `${props.year} 年每月員工應發總額（長條）與實發總額（折線）`)

// ───────── 沒有任何封存月份：空狀態 ─────────

const draftChips = computed(() =>
  rows.value
    .filter(r => r.employee_count === 0 && r.employee_count_pending > 0)
    .sort((a, b) => a.month - b.month)
    .map(r => ({ key: `draft-${r.month}`, kind: 'draft', text: `${r.month} 月 · 草稿 ${r.employee_count_pending} 人` }))
)
const unsettledChip = computed(() => {
  const months: number[] = []
  for (let m = 1; m <= 12; m++) {
    const r = byMonth.value.get(m)
    const hasDraft = (r?.employee_count_pending ?? 0) > 0
    if (monthState(period.value, m) === 'past' && !isSealed(m) && !hasDraft) months.push(m)
  }
  if (!months.length) return []
  return [{ key: 'unsettled', kind: 'unsettled', text: `${monthRangeText(months)} · 尚未結算` }]
})
const stateChips = computed(() => [...draftChips.value, ...unsettledChip.value])

// ───────── 焦點月前 5 名（內嵌） ─────────

const focusSealed = computed(() => isSealed(props.focusMonth))
const contributors = ref<SalaryContributors | null>(null)
const contribLoading = ref(false)
const contribError = ref('')
let contribSeq = 0

async function loadContributors(year: number, month: number, seq: number) {
  try {
    const res = await getSalaryContributors(year, month)
    if (seq !== contribSeq) return
    contributors.value = res.data
  } catch (e) {
    if (seq !== contribSeq) return
    contribError.value = apiError(e, '載入前 5 名失敗')
  } finally {
    if (seq === contribSeq) contribLoading.value = false
  }
}

// 序號：快速切月時晚到的舊回應直接丟棄，不蓋掉新月份的畫面
watch(
  [() => props.year, () => props.focusMonth, focusSealed],
  ([year, month, sealed]) => {
    const seq = ++contribSeq
    contributors.value = null
    contribError.value = ''
    if (!sealed) {
      contribLoading.value = false
      return
    }
    contribLoading.value = true
    loadContributors(year, month, seq)
  },
  { immediate: true }
)
onBeforeUnmount(() => { contribSeq++ })

const topGross = computed(() => contributors.value?.top_gross ?? [])
const topOvertime = computed(() => contributors.value?.top_overtime ?? [])
// 非 admin/hr 時後端把金額遮罩成 null（F-031），不能顯示成 0
const amountText = (v: number | null | undefined) => (v == null ? '未開放' : formatAmount(v))

// ───────── 年度累計 ─────────

const expenseCategories = computed<Array<{ category: string; amount: number }>>(
  () => financeData.value?.expense_by_category ?? []
)
const categoryAmount = (category: string) =>
  expenseCategories.value.find(c => c.category === category)?.amount || 0
const totalGross = computed(() => categoryAmount('salary_gross'))
const totalEmployerBenefit = computed(() => categoryAmount('employer_benefit'))
const totalPersonnelCost = computed(() => totalGross.value + totalEmployerBenefit.value)
</script>

<template>
  <el-skeleton v-if="loading" :rows="8" animated />

  <div v-else-if="dashboardFailed" class="salary-error" data-test="salary-error">
    <el-empty :description="dashboardErrorText">
      <el-button type="primary" data-test="salary-reload" @click="reload">重新載入</el-button>
    </el-empty>
  </div>

  <el-card v-else-if="!hasSealed" class="empty-card" shadow="never" data-test="salary-empty">
    <div class="empty-body">
      <div class="empty-text">
        <h3 class="empty-title">{{ year }} 年還沒有封存的薪資月份</h3>
        <p class="empty-desc">薪資結算封存後，這裡會顯示每月員工應發與實發。草稿與待重算的月份不計入，避免數字跟著試算跳動。</p>
        <ul v-if="stateChips.length" class="chip-list" data-test="salary-chips">
          <li
            v-for="chip in stateChips"
            :key="chip.key"
            class="chip"
            :class="`chip--${chip.kind}`"
            :data-test="`chip-${chip.key}`"
          >{{ chip.text }}</li>
        </ul>
      </div>
      <router-link v-slot="{ href, navigate }" to="/salary/settle" custom>
        <el-button type="primary" tag="a" :href="href" class="goto-settle" data-test="goto-settle" @click="navigate">前往薪資結算</el-button>
      </router-link>
    </div>
  </el-card>

  <div v-else class="salary-panel">
    <div class="salary-layout">
      <el-card class="chart-card" shadow="never">
        <template #header><span class="chart-title">每月應發與實發</span></template>
        <div class="salary-note" data-test="salary-note">只顯示已封存的月份（草稿與待重算不計入）。點長條可切換月份。</div>
        <div class="chart-container" role="img" :aria-label="chartAriaLabel">
          <BarChart :data="salaryChartData" :options="salaryChartOptions" />
        </div>
      </el-card>

      <el-card class="contrib-card" shadow="never" data-test="contributors">
        <p v-if="!focusSealed" class="contrib-note" data-test="contrib-unsealed">{{ focusMonth }} 月薪資尚未封存</p>
        <el-skeleton v-else-if="contribLoading" :rows="6" animated data-test="contrib-loading" />
        <p v-else-if="contribError" class="contrib-error" role="alert" data-test="contrib-error">{{ contribError }}</p>
        <template v-else>
          <section class="rank-section" data-test="top-gross">
            <h4 class="rank-title">{{ focusMonth }} 月應發金額前 5 名</h4>
            <ol v-if="topGross.length" class="rank-list">
              <li v-for="(row, i) in topGross" :key="row.employee_id" class="rank-item" data-test="rank-item">
                <span class="rank-no">{{ i + 1 }}</span>
                <span class="rank-name">{{ row.employee_name }}</span>
                <span class="rank-amount">{{ amountText(row.gross_salary) }}</span>
              </li>
            </ol>
            <p v-else class="rank-empty">{{ focusMonth }} 月沒有可列出的薪資紀錄</p>
          </section>
          <section class="rank-section" data-test="top-overtime">
            <h4 class="rank-title">{{ focusMonth }} 月加班費前 5 名</h4>
            <ol v-if="topOvertime.length" class="rank-list">
              <li v-for="(row, i) in topOvertime" :key="row.employee_id" class="rank-item" data-test="rank-item">
                <span class="rank-no">{{ i + 1 }}</span>
                <span class="rank-name">{{ row.employee_name }}</span>
                <span class="rank-amount">{{ amountText(row.overtime_pay) }}</span>
              </li>
            </ol>
            <p v-else class="rank-empty">{{ focusMonth }} 月沒有加班費紀錄</p>
          </section>
        </template>
      </el-card>
    </div>

    <el-card v-if="financeData" class="annual-card" shadow="never" data-test="annual-card">
      <template #header><span class="chart-title">人事成本（{{ year }} 年累計）</span></template>
      <div class="annual-grid">
        <div class="annual-item">
          <div class="annual-label">員工應發</div>
          <div class="annual-value" data-test="annual-gross">{{ formatAmount(totalGross) }}</div>
        </div>
        <div class="annual-item">
          <div class="annual-label">雇主保費＋勞退</div>
          <div class="annual-value" data-test="annual-benefit">{{ formatAmount(totalEmployerBenefit) }}</div>
        </div>
        <div class="annual-item annual-item--total">
          <div class="annual-label">人事成本合計</div>
          <div class="annual-value annual-value--total" data-test="annual-total">{{ formatAmount(totalPersonnelCost) }}</div>
        </div>
      </div>
      <div class="annual-note" data-test="annual-note">單位為新台幣元，只計入已封存的薪資月份。</div>
    </el-card>
    <el-card v-else-if="financeError" class="annual-card" shadow="never" data-test="annual-error-card">
      <template #header><span class="chart-title">人事成本（{{ year }} 年累計）</span></template>
      <div class="annual-error">
        <span data-test="annual-error">{{ financeErrorText }}</span>
        <el-button link type="primary" data-test="annual-reload" @click="finance.refresh(true)">重新載入</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.chart-title { font-size: var(--text-base); font-weight: 600; color: var(--text-primary); }

/* 圖在左、前 5 名在右；窄螢幕前 5 名掉到圖的下方 */
.salary-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--space-4);
  align-items: start;
  margin-bottom: var(--space-4);
}
@media (--to-lg) {
  .salary-layout { grid-template-columns: minmax(0, 1fr); }
}

.salary-note { font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: var(--space-2); }
.chart-container { height: 360px; position: relative; }
@media (--to-sm) {
  .chart-container { height: 280px; }
}

/* 前 5 名 */
.contrib-note,
.rank-empty,
.contrib-error { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); }
.contrib-error { color: var(--color-danger); }
.rank-section + .rank-section { margin-top: var(--space-5); }
.rank-title { margin: 0 0 var(--space-2); font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }
.rank-list { margin: 0; padding: 0; list-style: none; }
.rank-item {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-color-light);
  font-size: var(--text-sm);
}
.rank-item:last-child { border-bottom: 0; }
.rank-no { width: var(--space-4); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.rank-name { flex: 1; min-width: 0; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-amount { color: var(--text-primary); font-variant-numeric: tabular-nums; }

/* 年度累計 */
.annual-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }
.annual-item { padding: var(--space-2) 0; text-align: center; }
.annual-label { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-1); }
.annual-value { font-size: var(--text-2xl); font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.annual-value--total { font-weight: 700; }
.annual-note { margin-top: var(--space-2); font-size: var(--text-xs); color: var(--text-secondary); text-align: center; }
.annual-error { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--color-danger); }
@media (--to-sm) {
  .annual-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .annual-item { display: flex; justify-content: space-between; align-items: baseline; text-align: left; }
  .annual-label { margin-bottom: 0; }
  .annual-value { font-size: var(--text-xl); }
  .annual-note { text-align: left; }
}

/* 空狀態 */
.empty-body { display: flex; align-items: center; justify-content: space-between; gap: var(--space-6); }
.empty-text { flex: 1; min-width: 0; }
.empty-title { margin: 0 0 var(--space-2); font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); }
.empty-desc { margin: 0; font-size: var(--text-sm); line-height: 1.6; color: var(--text-secondary); }
.chip-list { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-4) 0 0; padding: 0; list-style: none; }
.chip {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.chip--draft { background: var(--color-warning-soft); color: var(--color-warning-darker); }
.chip--unsettled { background: var(--color-neutral-100); color: var(--text-secondary); }
@media (--to-sm) {
  .empty-body { flex-direction: column; align-items: stretch; gap: var(--space-4); }
}
.goto-settle { text-decoration: none; }
</style>
