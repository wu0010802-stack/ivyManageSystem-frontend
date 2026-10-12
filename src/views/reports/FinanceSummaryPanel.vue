<script setup lang="ts">
/**
 * 經營報表 › 收支分析（原「收支彙總」，2026-10-12 改版提案 F8）。
 *
 * 只回答「錢從哪來、花到哪去」：拿掉與總覽重複的四張 KPI 卡與趨勢圖。
 * - 範圍：焦點月／全年；0 元的類別收成一行
 * - 支出不完整（固定支出未登錄、薪資未封存）時說明原因並給出路，取代「無支出資料」
 * - 每月明細：無收支紀錄的月份收成一行、0 不做連結、焦點月高亮、累計與狀態欄、合計列
 * - 下鑽改右側抽屜（FinanceDetailDrawer）
 */
import { computed, ref, toRef } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard, getFinanceSummary } from '@/api/reports'
import { apiError } from '@/utils/error'
import FinanceDetailDrawer from './FinanceDetailDrawer.vue'
import type { DetailGroup } from './financeDetail'
import { computeReportPeriod, monthState } from './useReportPeriod'
import { firstMonthWithData, futurePreloggedExpense, type FinanceTrendRow } from './financeTrend'
import {
  buildCloseMatrix, monthExpenseGaps, monthExpenseUnknowns, monthsWith,
  type FixedCostStatus, type SalaryMonthRow,
} from './closeStatus'
import { formatAmount, monthRangeText } from './reportFormat'
import { useMonthFinance, type CategoryAmount, type MonthFinanceData } from './useMonthFinance'

const props = defineProps<{
  year: number
  focusMonth: number
  fixedCost: FixedCostStatus
}>()
const emit = defineEmits<{
  'update:focusMonth': [number]
  navigate: [{ tab: string; month?: number }]
}>()

const yearLevel = useCachedAsync(
  `reports/finance:${props.year}`,
  () => getFinanceSummary(props.year).then(r => r.data),
  { ttl: 300_000 },
)
const dashboard = useCachedAsync(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 },
)
const monthLevel = useMonthFinance(props.year, toRef(props, 'focusMonth'))

const scope = ref<'month' | 'year'>('month')

const loading = computed(() => yearLevel.pending.value && !yearLevel.data.value)
const yearError = computed(() => (yearLevel.error.value && !yearLevel.data.value
  ? apiError(yearLevel.error.value, '載入收支資料失敗') : ''))

const trend = computed<FinanceTrendRow[]>(() => yearLevel.data.value?.monthly_trend || [])
const period = computed(() => computeReportPeriod(props.year, trend.value))
const fm = computed(() => props.focusMonth)

const matrix = computed(() => buildCloseMatrix({
  trend: trend.value,
  period: period.value,
  salaryMonthly: (dashboard.data.value?.salary_monthly as SalaryMonthRow[] | undefined) ?? null,
  salaryReason: dashboard.pending.value ? 'loading' : 'error',
  fixedCost: props.fixedCost,
}))

// ── 範圍資料 ─────────────────────────────────────────────────────────
const scopeData = computed<MonthFinanceData | null>(() =>
  scope.value === 'month' ? monthLevel.data.value : (yearLevel.data.value as MonthFinanceData | null))
const scopeLoading = computed(() => scope.value === 'month' && monthLevel.pending.value)
const scopeError = computed(() => (scope.value === 'month' && monthLevel.error.value
  ? apiError(monthLevel.error.value, '載入該月資料失敗') : ''))
const scopeLabel = computed(() => (scope.value === 'month' ? `${fm.value} 月` : `${props.year} 全年`))

interface CatRow { key: string; label: string; amount: number; pct: number }
function splitCats(items: CategoryAmount[] | undefined) {
  const list = (items || []).map(c => ({ key: c.category || c.label || '', label: c.label || '', amount: c.amount || 0 }))
  const total = list.reduce((s, c) => s + c.amount, 0)
  const nonZero: CatRow[] = list
    .filter(c => c.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
    .map(c => ({ ...c, pct: total ? (c.amount / total) * 100 : 0 }))
  const zero = list.filter(c => c.amount === 0).map(c => c.label)
  return { total, nonZero, zero }
}
const income = computed(() => splitCats(scopeData.value?.revenue_by_category))
const expenses = computed(() => splitCats(scopeData.value?.expense_by_category))
const refundTotal = computed(() =>
  (scopeData.value?.revenue_by_category || []).reduce((s, c) => s + (c.refund || 0), 0))
const refundParts = computed(() =>
  (scopeData.value?.revenue_by_category || []).filter(c => (c.refund || 0) > 0).map(c => c.label).join('、'))

// 支出缺項：月範圍看焦點月，全年範圍看所有已過月份
const gapText = computed(() => {
  if (scope.value === 'month') {
    if (monthState(period.value, fm.value) !== 'past') return ''
    return monthExpenseGaps(matrix.value, fm.value).join('、')
  }
  const fixedMiss = monthsWith(matrix.value.fixedCost, 'miss')
    .filter(m => monthState(period.value, m) === 'past')
  const salaryMiss = monthsWith(matrix.value.salary, 'miss', 'draft')
  const parts: string[] = []
  if (fixedMiss.length) parts.push(`固定支出 ${monthRangeText(fixedMiss)}未登錄`)
  if (salaryMiss.length) parts.push(`薪資 ${monthRangeText(salaryMiss)}未封存`)
  return parts.join('、')
})
// 查不到（無權限／讀取失敗）≠ 已完整
const unknownText = computed(() => {
  const items = scope.value === 'month'
    ? (monthState(period.value, fm.value) === 'past' ? monthExpenseUnknowns(matrix.value, fm.value) : [])
    : [
        ...(matrix.value.fixedCostReason ? ['固定支出登錄狀態'] : []),
        ...(matrix.value.salaryReason ? ['薪資封存狀態'] : []),
      ]
  return items.join('、')
})
const fixedMissing = computed(() => monthsWith(matrix.value.fixedCost, 'miss').length > 0)
const salaryMissing = computed(() => monthsWith(matrix.value.salary, 'miss', 'draft').length > 0)
const prelogged = computed(() => futurePreloggedExpense(trend.value, period.value.cutoffMonth))

// ── 每月明細 ──────────────────────────────────────────────────────────
interface MonthRow extends FinanceTrendRow { cumulative: number; state: 'past' | 'current'; status: 'prog' | 'gap' | 'unknown' | 'ok'; gaps: string[] }
const firstData = computed(() => firstMonthWithData(trend.value))
const tableRows = computed(() => {
  const byMonth = new Map(trend.value.map(r => [r.month, r]))
  const rows: MonthRow[] = []
  const folded: number[] = []
  let running = 0
  for (let m = 1; m <= period.value.cutoffMonth; m++) {
    const r = byMonth.get(m) ?? { month: m, revenue: 0, refund: 0, expense: 0, net: 0 }
    running += r.net || 0
    const state = monthState(period.value, m) === 'current' ? 'current' : 'past'
    const beforeFirst = firstData.value == null || m < firstData.value
    if (beforeFirst && state === 'past') { folded.push(m); continue }
    const gaps = state === 'past' ? monthExpenseGaps(matrix.value, m) : []
    const unknown = matrix.value.fixedCost[m - 1] === 'unknown' || matrix.value.salary[m - 1] === 'unknown'
    const status: MonthRow['status'] = state === 'current' ? 'prog' : gaps.length ? 'gap' : unknown ? 'unknown' : 'ok'
    rows.push({ ...r, cumulative: running, state, status, gaps })
  }
  return { rows, folded }
})
const tableTotal = computed(() => tableRows.value.rows.reduce(
  (t, r) => ({ revenue: t.revenue + r.revenue, refund: t.refund + r.refund, expense: t.expense + r.expense, net: t.net + r.net }),
  { revenue: 0, refund: 0, expense: 0, net: 0 },
))

// ── 下鑽 ──────────────────────────────────────────────────────────────
const drawerOpen = ref(false)
const drawerMonth = ref<number | null>(null)
const drawerGroup = ref<DetailGroup>('revenue')
const drawerTotals = ref<{ revenue: number; refund: number; expense: number } | null>(null)
function openDetail(row: FinanceTrendRow, group: DetailGroup) {
  drawerMonth.value = row.month
  drawerGroup.value = group
  drawerTotals.value = { revenue: row.revenue, refund: row.refund, expense: row.expense }
  drawerOpen.value = true
}
</script>

<template>
  <el-skeleton v-if="loading" :rows="10" animated />
  <div v-else-if="yearError" class="fin-error" data-test="finance-error">
    <el-empty :description="yearError">
      <el-button @click="yearLevel.refresh(true)">重新載入</el-button>
    </el-empty>
  </div>
  <div v-else class="fin">
    <div class="fin__bar">
      <span class="fin__bar-label">範圍</span>
      <el-radio-group v-model="scope" size="small" data-test="scope-toggle">
        <el-radio-button value="month">{{ fm }} 月</el-radio-button>
        <el-radio-button value="year">{{ year }} 全年</el-radio-button>
      </el-radio-group>
      <span v-if="scope === 'year' && prelogged.total > 0" class="fin__note" data-test="prelogged-note">
        全年含 {{ monthRangeText(prelogged.months) }}預登錄的固定支出 {{ formatAmount(prelogged.total) }}
      </span>
    </div>

    <div class="fin__cats">
      <section class="fin-card" data-test="income-card">
        <header class="fin-card__head">
          <h3>收入來源 · {{ scopeLabel }}</h3>
          <span v-if="scopeData" class="fin-card__hint">合計 {{ formatAmount(income.total) }}</span>
        </header>
        <el-skeleton v-if="scopeLoading" :rows="3" animated />
        <p v-else-if="scopeError" class="fin-card__error">{{ scopeError }}</p>
        <template v-else-if="scopeData">
          <ul v-if="income.nonZero.length" class="cats">
            <li v-for="c in income.nonZero" :key="c.key" data-test="income-row">
              <span class="cats__label">{{ c.label }}</span>
              <span class="cats__amt">{{ formatAmount(c.amount) }} <small>{{ c.pct.toFixed(1) }}%</small></span>
              <span class="cats__track"><i class="cats__fill cats__fill--inc" :style="{ width: `${c.pct}%` }" /></span>
            </li>
          </ul>
          <p v-else class="fin-card__empty">{{ scopeLabel }}沒有收入紀錄。</p>
          <p v-if="income.zero.length && income.nonZero.length" class="cats__zero" data-test="income-zero">
            {{ income.zero.join('、') }}：本期皆為 0
          </p>
          <div v-if="refundTotal" class="cats__refund" data-test="refund-line">
            <span>退款 <small>{{ refundParts }}</small></span>
            <span class="cats__amt tone--bad">−{{ formatAmount(refundTotal) }}</span>
          </div>
        </template>
      </section>

      <section class="fin-card" data-test="expense-card">
        <header class="fin-card__head">
          <h3>支出去向 · {{ scopeLabel }}</h3>
          <span v-if="scopeData" class="fin-card__hint">合計 {{ formatAmount(expenses.total) }}</span>
        </header>
        <el-skeleton v-if="scopeLoading" :rows="3" animated />
        <p v-else-if="scopeError" class="fin-card__error">{{ scopeError }}</p>
        <template v-else-if="scopeData">
          <ul v-if="expenses.nonZero.length" class="cats">
            <li v-for="c in expenses.nonZero" :key="c.key" data-test="expense-row">
              <span class="cats__label">{{ c.label }}</span>
              <span class="cats__amt">{{ formatAmount(c.amount) }} <small>{{ c.pct.toFixed(1) }}%</small></span>
              <span class="cats__track"><i class="cats__fill cats__fill--exp" :style="{ width: `${c.pct}%` }" /></span>
            </li>
          </ul>
          <p v-else-if="!gapText && !unknownText" class="fin-card__empty">{{ scopeLabel }}沒有支出紀錄。</p>
          <p v-if="!gapText && unknownText" class="fin-card__unknown" data-test="expense-unknown">
            {{ unknownText }}查不到，無法確認這裡的支出是否完整。
          </p>
          <div v-if="gapText" class="gap-box" data-test="expense-gap">
            <p><b>支出可能不完整。</b>{{ gapText }}，所以這裡的支出會偏低。</p>
            <div class="gap-box__acts">
              <el-button v-if="fixedMissing" size="small" @click="emit('navigate', { tab: 'fixed-cost' })">登錄固定支出</el-button>
              <router-link v-if="salaryMissing" to="/salary/settle" class="gap-box__link">前往薪資結算</router-link>
            </div>
          </div>
        </template>
      </section>
    </div>

    <section class="fin-card" data-test="month-table">
      <header class="fin-card__head">
        <h3>每月明細</h3>
        <span class="fin-card__hint">點金額看原始交易；點月份切換焦點</span>
      </header>
      <div class="tbl-wrap">
        <table class="mt">
          <thead>
            <tr>
              <th scope="col">月份</th>
              <th scope="col">收入</th>
              <th scope="col">退款</th>
              <th scope="col">支出</th>
              <th scope="col">淨現金</th>
              <th scope="col">累計淨現金</th>
              <th scope="col" class="mt__status">狀態</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="tableRows.folded.length" class="mt__fold" data-test="row-folded">
              <td>{{ monthRangeText(tableRows.folded) }}</td>
              <td colspan="6">無收支紀錄</td>
            </tr>
            <tr
              v-for="r in tableRows.rows" :key="r.month"
              :class="{ 'is-focus': r.month === fm }"
              :data-test="`row-${r.month}`"
            >
              <td>
                <button type="button" class="mt__month" @click="emit('update:focusMonth', r.month)">{{ r.month }} 月</button>
              </td>
              <td>
                <button v-if="r.revenue" type="button" class="amt" :data-test="`amt-revenue-${r.month}`" @click="openDetail(r, 'revenue')">{{ formatAmount(r.revenue) }}</button>
                <span v-else class="zero">0</span>
              </td>
              <td>
                <button v-if="r.refund" type="button" class="amt" @click="openDetail(r, 'refund')">{{ formatAmount(r.refund) }}</button>
                <span v-else class="zero">0</span>
              </td>
              <td>
                <button v-if="r.expense" type="button" class="amt" :data-test="`amt-expense-${r.month}`" @click="openDetail(r, 'expense')">{{ formatAmount(r.expense) }}</button>
                <span v-else class="zero">0</span>
              </td>
              <td :class="{ 'tone--bad': r.net < 0 }">{{ formatAmount(r.net) }}</td>
              <td>{{ formatAmount(r.cumulative) }}</td>
              <td class="mt__status">
                <el-tag v-if="r.status === 'prog'" size="small" type="primary">進行中</el-tag>
                <el-tooltip v-else-if="r.status === 'gap'" :content="r.gaps.join('、')" placement="top">
                  <el-tag size="small" type="warning" :data-test="`status-gap-${r.month}`">支出待補</el-tag>
                </el-tooltip>
                <el-tag v-else-if="r.status === 'unknown'" size="small" type="info">無法確認</el-tag>
                <el-tooltip v-else content="固定支出已登錄、薪資已封存" placement="top">
                  <el-tag size="small" type="success">齊全</el-tag>
                </el-tooltip>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="tableRows.rows.length">
            <tr data-test="row-total">
              <td>合計</td>
              <td>{{ formatAmount(tableTotal.revenue) }}</td>
              <td>{{ formatAmount(tableTotal.refund) }}</td>
              <td>{{ formatAmount(tableTotal.expense) }}</td>
              <td :class="{ 'tone--bad': tableTotal.net < 0 }">{{ formatAmount(tableTotal.net) }}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <FinanceDetailDrawer
      v-model="drawerOpen"
      :year="year"
      :month="drawerMonth"
      :initial-group="drawerGroup"
      :totals="drawerTotals"
    />
  </div>
</template>

<style scoped>
.fin { display: flex; flex-direction: column; gap: var(--space-4); }
.fin-error { padding: var(--space-8, 32px) 0; }
.fin__bar { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.fin__bar-label { font-size: var(--text-sm); color: var(--text-tertiary); }
.fin__note { font-size: var(--text-xs); color: var(--text-tertiary); }
.fin__cats { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-4); }

.fin-card {
  background: var(--surface-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4) var(--space-4);
  min-width: 0;
}
.fin-card__head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); margin-bottom: var(--space-3); flex-wrap: wrap; }
.fin-card__head h3 { margin: 0; font-size: var(--text-base); font-weight: 600; color: var(--text-primary); }
.fin-card__hint { font-size: var(--text-xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.fin-card__empty { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); }
.fin-card__unknown { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--text-secondary); }
.fin-card__error { margin: 0; font-size: var(--text-sm); color: var(--color-danger); }

.cats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.cats li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px var(--space-3); font-size: var(--text-sm); }
.cats__label { color: var(--text-primary); }
.cats__amt { font-variant-numeric: tabular-nums; text-align: right; color: var(--text-primary); }
.cats__amt small { color: var(--text-tertiary); margin-left: 4px; }
.cats__track { grid-column: 1 / -1; height: 8px; border-radius: var(--radius-full); background: var(--color-neutral-100); overflow: hidden; }
.cats__fill { display: block; height: 100%; border-radius: var(--radius-full); }
.cats__fill--inc { background: var(--color-success); }
.cats__fill--exp { background: var(--color-danger); }
.cats__zero { margin: var(--space-3) 0 0; font-size: var(--text-xs); color: var(--text-tertiary); }
.cats__refund {
  display: flex; justify-content: space-between; gap: var(--space-3);
  margin-top: var(--space-3); padding-top: var(--space-3);
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: var(--text-sm); color: var(--text-primary);
}
.cats__refund small { color: var(--text-tertiary); margin-left: 4px; }

.gap-box {
  margin-top: var(--space-3);
  background: var(--color-warning-soft);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-primary);
  line-height: 1.6;
}
.gap-box p { margin: 0; }
.gap-box b { color: var(--color-warning-darker); }
.gap-box__acts { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-2); }
.gap-box__link { font-size: var(--text-sm); color: var(--el-color-primary); text-decoration: none; }
.gap-box__link:hover { text-decoration: underline; }

.tbl-wrap { overflow-x: auto; }
.mt { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.mt th, .mt td { padding: 8px 10px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; border-bottom: 1px solid var(--el-border-color-lighter); }
.mt th { font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary); background: var(--color-neutral-50); }
.mt th:first-child, .mt td:first-child, .mt .mt__status { text-align: left; }
.mt tbody tr.is-focus td { background: var(--el-color-primary-light-9); }
.mt tbody tr.is-focus td:first-child { box-shadow: inset 2px 0 0 var(--el-color-primary); }
.mt__fold td { color: var(--text-tertiary); font-size: var(--text-xs); background: var(--color-neutral-50); text-align: left; }
.mt tfoot td { font-weight: 700; border-top: 1px solid var(--el-border-color); border-bottom: 0; }
.mt__month, .amt { background: none; border: none; padding: 0; font: inherit; cursor: pointer; color: var(--text-primary); }
.mt__month:hover { color: var(--el-color-primary); }
.amt { text-decoration: underline; text-decoration-color: var(--el-color-primary-light-5); text-underline-offset: 3px; }
.amt:hover { color: var(--el-color-primary); }
.mt__month:focus-visible, .amt:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.zero { color: var(--text-tertiary); }
.tone--bad { color: var(--color-danger); }

@media (--to-md) {
  .fin__cats { grid-template-columns: minmax(0, 1fr); }
}
</style>
