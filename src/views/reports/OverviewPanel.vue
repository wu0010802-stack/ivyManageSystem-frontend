<script setup lang="ts">
/**
 * 經營報表 › 總覽（2026-10-12 改版，提案 F2／F3／F5／F8）。
 *
 * 只回答兩件事：焦點月的收支怎樣、還缺什麼沒登錄。
 * - 收支等式：收入 − 退款 − 支出 ＝ 淨現金（焦點月主數字、年初至今第二行）；
 *   比較基準不完整時不算百分比、直接寫原因；淨現金用金額差比較（淨額近 0 時百分比會爆）
 * - 支出缺項（固定支出未登錄、薪資未封存）就地點名，不讓「淨現金偏高」被誤讀
 * - 結帳狀態矩陣取代逐月重複的待辦；查不到的資料標「無法確認」，不給假的全清
 */
import { computed, ref, toRef } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard, getFinanceSummary } from '@/api/reports'
import { getVendorPaymentSummary } from '@/api/vendorPayment'
import { getMiscReceiptSummary } from '@/api/miscReceipt'
import { hasPermission } from '@/utils/auth'
import { money } from '@/utils/format'
import { apiError } from '@/utils/error'
import { BarChart } from './chartSetup'
import { computeReportPeriod, monthState } from './useReportPeriod'
import { buildMonthlyMoneyChart, monthBandsPlugin } from './trendChart'
import {
  deltaKind, firstMonthWithData, pctChange, sumTrendUpTo, type FinanceTrendRow,
} from './financeTrend'
import {
  buildCloseMatrix, fixedCostSummary, monthExpenseGaps, monthExpenseUnknowns, salarySummary,
  type CloseCell, type FixedCostStatus, type SalaryMonthRow, UNKNOWN_REASON_TEXT,
} from './closeStatus'
import { formatAmount, formatSignedAmount, formatWan } from './reportFormat'
import { useMonthFinance } from './useMonthFinance'
import type { ChartOptions, Plugin } from 'chart.js'

const props = defineProps<{
  year: number
  focusMonth: number
  fixedCost: FixedCostStatus
}>()

const emit = defineEmits<{
  'update:focusMonth': [number]
  navigate: [{ tab: string; month?: number }]
}>()

// ReportsView 對 panel 掛 `:key="selectedYear"`：年度切換整個重掛，年度級 cache key 算一次即可；
// 焦點月份不重掛，月級資料用 reactive key。
const dashboard = useCachedAsync(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 },
)
const finance = useCachedAsync(
  `reports/finance:${props.year}`,
  () => getFinanceSummary(props.year).then(r => r.data),
  { ttl: 300_000 },
)
const prevYearFinance = useCachedAsync(
  `reports/finance:${props.year - 1}`,
  () => getFinanceSummary(props.year - 1).then(r => r.data),
  { ttl: 300_000 },
)
// 焦點月的分類拆分（人事成本用）；月份改變即清空重抓，不會先顯示上個月的數字
const monthFinance = useMonthFinance(props.year, toRef(props, 'focusMonth'))

const loading = computed(() =>
  (dashboard.pending.value && !dashboard.data.value)
  || (finance.pending.value && !finance.data.value),
)
const financeUnavailable = computed(() => !!finance.error.value && !finance.data.value)
const dashboardUnavailable = computed(() => !!dashboard.error.value && !dashboard.data.value)
const financeErrorText = computed(() => apiError(finance.error.value, '載入收支資料失敗'))

const trend = computed<FinanceTrendRow[]>(() => finance.data.value?.monthly_trend || [])
const prevTrend = computed<FinanceTrendRow[]>(() => prevYearFinance.data.value?.monthly_trend || [])
const period = computed(() => computeReportPeriod(props.year, trend.value))
const fm = computed(() => props.focusMonth)
const focusState = computed(() => monthState(period.value, fm.value))
const firstDataMonth = computed(() => firstMonthWithData(trend.value))

const ZERO_ROW: FinanceTrendRow = { month: 0, revenue: 0, refund: 0, expense: 0, net: 0 }
function rowOf(rows: FinanceTrendRow[], m: number): FinanceTrendRow {
  return rows.find(r => r.month === m) ?? { ...ZERO_ROW, month: m }
}
function hasData(r: FinanceTrendRow): boolean {
  return !!(r.revenue || r.refund || r.expense || r.net)
}

const cur = computed(() => rowOf(trend.value, fm.value))
// 年初至今只加到「焦點月」與「截止月」較早者：焦點選在未來月時，不把預登錄固定支出當成已發生
const ytdMonth = computed(() => Math.max(0, Math.min(fm.value, period.value.cutoffMonth)))
const ytd = computed(() => sumTrendUpTo(trend.value, ytdMonth.value))

// ── 結帳狀態 ──────────────────────────────────────────────────────────
const salaryMonthly = computed<SalaryMonthRow[] | null>(() =>
  (dashboard.data.value?.salary_monthly as SalaryMonthRow[] | undefined) ?? null)
const matrix = computed(() => {
  const m = buildCloseMatrix({
    trend: trend.value,
    period: period.value,
    salaryMonthly: salaryMonthly.value,
    salaryReason: dashboard.pending.value ? 'loading' : 'error',
    fixedCost: props.fixedCost,
  })
  // 收支資料讀不到時，「收入入帳」也只能說無法確認（不能顯示成無紀錄）
  if (financeUnavailable.value) m.revenue = m.revenue.map(c => (c === 'future' ? c : 'unknown'))
  return m
})
const expenseGaps = computed(() =>
  focusState.value === 'past' ? monthExpenseGaps(matrix.value, fm.value) : [])
// 查不到（無權限／讀取失敗）≠ 已完整：支出旁標「未確認」，收支比不計算
const expenseUnknowns = computed(() =>
  focusState.value === 'past' ? monthExpenseUnknowns(matrix.value, fm.value) : [])
const fixedSummary = computed(() => fixedCostSummary(matrix.value))
const salarySum = computed(() => salarySummary(matrix.value, salaryMonthly.value))

// ── 比較基準（不完整就不比，寫原因） ─────────────────────────────────────
const momBase = computed<{ row: FinanceTrendRow; label: string } | { reason: string }>(() => {
  const m = fm.value
  if (focusState.value === 'future') return { reason: `${m} 月尚未開始` }
  if (focusState.value === 'current') return { reason: `${m} 月進行中，月底後再比較` }
  if (!hasData(cur.value)) return { reason: `${m} 月沒有收支紀錄` }
  if (m === 1 && !prevYearFinance.data.value) {
    return { reason: prevYearFinance.error.value ? '去年資料讀取失敗，暫不做月比較' : '去年資料載入中' }
  }
  const prev = m === 1 ? rowOf(prevTrend.value, 12) : rowOf(trend.value, m - 1)
  const label = m === 1 ? '去年 12 月' : `${m - 1} 月`
  if (!hasData(prev)) return { reason: `${label}沒有收支紀錄，暫不做月比較` }
  if (m > 1 && firstDataMonth.value === m - 1 && m - 1 > 1) {
    return { reason: `${m - 1} 月是今年第一個有收支的月份（可能不完整），暫不做月比較` }
  }
  return { row: prev, label }
})
const yoyBase = computed<FinanceTrendRow | null>(() => {
  if (focusState.value !== 'past' || !hasData(cur.value) || !prevYearFinance.data.value) return null
  const r = rowOf(prevTrend.value, fm.value)
  return hasData(r) ? r : null
})
const compareHint = computed(() => {
  const b = momBase.value
  if ('reason' in b) return b.reason
  return `比較：${b.label}${yoyBase.value ? `、去年 ${fm.value} 月` : ''}`
})

type TermKey = 'revenue' | 'refund' | 'expense'
interface CmpPart { label: string; text: string; tone: 'good' | 'bad' | 'flat' }
function pctPart(label: string, now: number, base: number, lowerIsBetter: boolean): CmpPart | null {
  const v = pctChange(now, base)
  const k = deltaKind(v)
  if (v == null || k == null) return null
  if (k === 'flat') return { label, text: '持平', tone: 'flat' }
  const good = lowerIsBetter ? k === 'down' : k === 'up'
  return { label, text: `${k === 'up' ? '↑' : '↓'} ${Math.abs(v).toFixed(1)}%`, tone: good ? 'good' : 'bad' }
}
function compareFor(key: TermKey): CmpPart[] {
  const out: CmpPart[] = []
  const b = momBase.value
  const lower = key !== 'revenue'
  if (!('reason' in b)) {
    const p = pctPart(`vs ${b.label}`, cur.value[key], b.row[key], lower)
    if (p) out.push(p)
  }
  if (yoyBase.value) {
    const p = pctPart('vs 去年', cur.value[key], yoyBase.value[key], lower)
    if (p) out.push(p)
  }
  return out
}
const netCompare = computed<CmpPart[]>(() => {
  const out: CmpPart[] = []
  const b = momBase.value
  const diffPart = (label: string, base: number): CmpPart => {
    const d = cur.value.net - base
    return { label, text: formatSignedAmount(d), tone: d > 0 ? 'good' : d < 0 ? 'bad' : 'flat' }
  }
  if (!('reason' in b)) out.push(diffPart(`比 ${b.label}`, b.row.net))
  if (yoyBase.value) out.push(diffPart('比去年', yoyBase.value.net))
  return out
})

const ytdLabel = computed(() => (ytdMonth.value >= 1 ? `1–${ytdMonth.value} 月累計` : '今年尚無累計'))

const terms = computed(() => [
  { key: 'revenue' as const, label: '收入', dot: 'inc', value: cur.value.revenue, ytd: ytd.value.revenue, cmp: compareFor('revenue') },
  { key: 'refund' as const, label: '退款', dot: 'ref', value: cur.value.refund, ytd: ytd.value.refund, cmp: compareFor('refund') },
  { key: 'expense' as const, label: '支出', dot: 'exp', value: cur.value.expense, ytd: ytd.value.expense, cmp: compareFor('expense') },
])

// ── 每月收支圖 ────────────────────────────────────────────────────────
const chart = computed(() => buildMonthlyMoneyChart(trend.value, period.value))
const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { display: false },
    monthBands: {
      noRecordMonths: chart.value.meta.noRecordMonths,
      focusMonth: fm.value,
      currentMonth: chart.value.meta.currentMonth,
    },
    tooltip: {
      callbacks: {
        title: (items: Array<{ dataIndex: number }>) => {
          const m = (items[0]?.dataIndex ?? 0) + 1
          return chart.value.meta.currentMonth === m ? `${m} 月（進行中）` : `${m} 月`
        },
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          ctx.parsed.y == null ? '' : `${ctx.dataset.label}：${money(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, ticks: { callback: (v: number | string) => formatWan(v) } },
  },
  onClick: (_e: unknown, elements: Array<{ index: number }>) => {
    if (elements.length) emit('update:focusMonth', elements[0].index + 1)
  },
}) as unknown as ChartOptions<'bar'>)
const chartPlugins = [monthBandsPlugin] as unknown as Plugin<'bar'>[]

// ── 待補憑證（廠商付款／雜項收款；summary 端點為「目前」全期間數字）────────────
interface PendingSignoff { count: number; amount: number }
const canCheckVendor = hasPermission('VENDOR_PAYMENT_READ')
const canCheckMisc = hasPermission('MISC_RECEIPT_READ')
const vendorSignoff = ref<PendingSignoff | null>(null)
const miscSignoff = ref<PendingSignoff | null>(null)
function toPendingSignoff(raw: unknown): PendingSignoff | null {
  const d = raw as { pending_count?: unknown; pending_amount?: unknown } | null
  if (!d || typeof d.pending_count !== 'number') return null
  return { count: d.pending_count, amount: typeof d.pending_amount === 'number' ? d.pending_amount : 0 }
}
if (canCheckVendor) {
  getVendorPaymentSummary()
    .then((res) => { vendorSignoff.value = toPendingSignoff(res.data) })
    .catch(() => { vendorSignoff.value = null })
}
if (canCheckMisc) {
  getMiscReceiptSummary()
    .then((res) => { miscSignoff.value = toPendingSignoff(res.data) })
    .catch(() => { miscSignoff.value = null })
}
/** hidden＝兩權限皆無；action＝有待補；done＝兩來源皆確知 0；unknown＝至少一邊查不到 */
const signoff = computed<{ state: 'hidden' | 'action' | 'done' | 'unknown'; text: string }>(() => {
  if (!canCheckVendor && !canCheckMisc) return { state: 'hidden', text: '' }
  const parts: string[] = []
  if (vendorSignoff.value?.count) parts.push(`廠商付款 ${vendorSignoff.value.count} 筆（${money(vendorSignoff.value.amount)}）`)
  if (miscSignoff.value?.count) parts.push(`雜項收款 ${miscSignoff.value.count} 筆（${money(miscSignoff.value.amount)}）`)
  if (parts.length) return { state: 'action', text: `目前待補：${parts.join('、')}` }
  const bothZero = canCheckVendor && vendorSignoff.value?.count === 0 && canCheckMisc && miscSignoff.value?.count === 0
  return bothZero
    ? { state: 'done', text: '憑證皆已補齊' }
    : { state: 'unknown', text: '憑證狀態請到收付款管理查看' }
})

// ── 其他指標（焦點月） ─────────────────────────────────────────────────
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const CELL_TEXT: Record<CloseCell, string> = {
  ok: '已完成', miss: '未完成', draft: '草稿', prog: '進行中', none: '無紀錄', future: '未來月', unknown: '無法確認',
}

const personnel = computed(() => {
  const cell = matrix.value.salary[fm.value - 1]
  const cats = monthFinance.data.value?.expense_by_category || []
  const gross = cats.find(c => c.category === 'salary_gross')?.amount || 0
  const employer = cats.find(c => c.category === 'employer_benefit')?.amount || 0
  if (cell === 'ok' && !monthFinance.data.value) {
    return monthFinance.error.value
      ? { value: '無法確認', na: true, sub: '收支資料讀取失敗' }
      : { value: '載入中', na: true, sub: '' }
  }
  if (cell === 'ok') return { value: formatAmount(gross + employer), na: false, sub: `應發 ${formatAmount(gross)} ＋ 雇主負擔 ${formatAmount(employer)}` }
  if (cell === 'prog') return { value: '本月進行中', na: true, sub: '月底結算封存後計入' }
  if (cell === 'unknown') return { value: '無法確認', na: true, sub: UNKNOWN_REASON_TEXT[matrix.value.salaryReason ?? 'error'] }
  if (cell === 'future') return { value: '尚未開始', na: true, sub: '' }
  return { value: '尚未封存', na: true, sub: cell === 'draft' ? '薪資仍是草稿，封存後才計入' : '薪資封存後才計入' }
})

const attendance = computed(() => {
  if (dashboardUnavailable.value) return { value: '無法確認', na: true, sub: '出勤資料讀取失敗' }
  const rows = (dashboard.data.value?.attendance_monthly || []) as Array<{ month: number; total_records?: number; rate?: number; late?: number }>
  const r = rows.find(x => x.month === fm.value)
  if (!r || !r.total_records) return { value: '無打卡紀錄', na: true, sub: '這個月沒有教職員打卡資料' }
  return { value: `${(r.rate ?? 0).toFixed(1)}%`, na: false, sub: `${formatAmount(r.total_records)} 筆打卡 · 遲到 ${r.late ?? 0} 次` }
})

const ratio = computed(() => {
  if (financeUnavailable.value) return { value: '無法確認', na: true, sub: '收支資料讀取失敗' }
  if (focusState.value !== 'past') return { value: '暫不計算', na: true, sub: '月份尚未結束' }
  if (expenseGaps.value.length) return { value: '暫不計算', na: true, sub: '支出還不完整，比值沒有意義' }
  if (expenseUnknowns.value.length) return { value: '無法確認', na: true, sub: `${expenseUnknowns.value.join('、')}查不到，支出可能不完整` }
  const income = cur.value.revenue - cur.value.refund
  if (!cur.value.expense) return { value: '—', na: true, sub: '這個月沒有支出紀錄' }
  return { value: (income / cur.value.expense).toFixed(2), na: false, sub: '（收入 − 退款）÷ 支出' }
})
</script>

<template>
  <el-skeleton v-if="loading" :rows="10" animated />
  <div v-else class="overview">
    <!-- 收支等式 -->
    <section class="ov-card eq-card" data-test="equation">
      <header class="ov-card__head">
        <h3 class="ov-card__title" data-test="equation-title">{{ fm }} 月收支</h3>
        <span v-if="!financeUnavailable" class="ov-card__hint" data-test="compare-hint">{{ compareHint }}</span>
      </header>
      <div v-if="financeUnavailable" class="ov-error" data-test="finance-error">
        <el-empty :description="financeErrorText" :image-size="60">
          <el-button @click="finance.refresh(true)">重新載入</el-button>
        </el-empty>
      </div>
      <div v-else class="eq">
        <template v-for="(t, i) in terms" :key="t.key">
          <div class="eq__term" :data-test="`term-${t.key}`">
            <div class="eq__label">
              <i :class="`dot dot--${t.dot}`" aria-hidden="true" />{{ t.label }}
              <el-tag v-if="t.key === 'expense' && expenseGaps.length" type="warning" size="small" data-test="expense-incomplete">不完整</el-tag>
              <el-tag v-else-if="t.key === 'expense' && expenseUnknowns.length" type="info" size="small" data-test="expense-unknown">未確認</el-tag>
            </div>
            <div class="eq__value" :data-test="`value-${t.key}`">{{ formatAmount(t.value) }}</div>
            <div class="eq__ytd">{{ ytdLabel }} {{ formatAmount(t.ytd) }}</div>
            <div v-if="t.cmp.length" class="eq__cmp" :data-test="`cmp-${t.key}`">
              <span v-for="c in t.cmp" :key="c.label">{{ c.label }} <b :class="`tone--${c.tone}`">{{ c.text }}</b></span>
            </div>
            <p v-if="t.key === 'expense' && expenseGaps.length" class="eq__gaps" data-test="expense-gaps">
              <b>支出不完整：</b>{{ expenseGaps.join('、') }}
            </p>
            <p v-else-if="t.key === 'expense' && expenseUnknowns.length" class="eq__unknown" data-test="expense-unknowns">
              {{ expenseUnknowns.join('、') }}查不到，無法確認支出是否完整
            </p>
          </div>
          <span class="eq__op" aria-hidden="true">{{ i < 2 ? '−' : '=' }}</span>
        </template>
        <div class="eq__term eq__term--net" data-test="term-net">
          <div class="eq__label"><i class="dot dot--net" aria-hidden="true" />淨現金</div>
          <div class="eq__value" data-test="value-net">{{ formatAmount(cur.net) }}</div>
          <div class="eq__ytd">{{ ytdLabel }} {{ formatAmount(ytd.net) }}</div>
          <div v-if="netCompare.length" class="eq__cmp" data-test="cmp-net">
            <span v-for="c in netCompare" :key="c.label">{{ c.label }} <b :class="`tone--${c.tone}`">{{ c.text }}</b></span>
          </div>
          <p v-if="expenseGaps.length" class="eq__netnote">支出補齊前，淨現金會偏高</p>
        </div>
      </div>
    </section>

    <div class="ov-grid">
      <!-- 每月收支 -->
      <section v-if="!financeUnavailable" class="ov-card" data-test="money-chart">
        <header class="ov-card__head">
          <h3 class="ov-card__title">{{ year }} 每月收支</h3>
          <div class="legend" aria-hidden="true">
            <span><i class="sw sw--inc" />收入</span>
            <span><i class="sw sw--exp" />支出</span>
            <span><i class="sw sw--net" />淨現金</span>
          </div>
        </header>
        <div class="chart-box">
          <BarChart :data="chart.data" :options="chartOptions" :plugins="chartPlugins" />
        </div>
        <p class="ov-foot">
          點任一個月就把月份焦點切過去；金額單位：萬元。
          <button type="button" class="link" data-test="goto-finance" @click="emit('navigate', { tab: 'finance' })">看收支分析 →</button>
        </p>
      </section>

      <!-- 結帳狀態 -->
      <section class="ov-card" data-test="close-status">
        <header class="ov-card__head">
          <h3 class="ov-card__title">結帳狀態</h3>
          <span class="ov-card__hint">{{ year }}</span>
        </header>
        <div class="mx-wrap">
          <table class="mx">
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">項目</span></th>
                <th v-for="m in MONTHS" :key="m" scope="col" :class="{ 'is-focus': m === fm }">{{ m }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in ([
                { key: 'revenue', label: '收入入帳', cells: matrix.revenue },
                { key: 'fixed', label: '固定支出', cells: matrix.fixedCost },
                { key: 'salary', label: '薪資封存', cells: matrix.salary },
              ] as const)" :key="row.key" :data-test="`mx-row-${row.key}`">
                <th scope="row">{{ row.label }}</th>
                <td v-for="(c, i) in row.cells" :key="i" :class="{ 'is-focus': i + 1 === fm }">
                  <span
                    :class="`cell cell--${c}`"
                    role="img"
                    :aria-label="`${i + 1} 月：${CELL_TEXT[c]}`"
                    :title="`${i + 1} 月：${CELL_TEXT[c]}`"
                    :data-test="`cell-${row.key}-${i + 1}`"
                    :data-state="c"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mx-legend" aria-hidden="true">
          <span><i class="cell cell--ok" />已完成</span>
          <span><i class="cell cell--miss" />未完成</span>
          <span><i class="cell cell--draft" />草稿</span>
          <span><i class="cell cell--prog" />進行中</span>
          <span><i class="cell cell--none" />無紀錄</span>
          <span><i class="cell cell--unknown" />無法確認</span>
        </div>
        <ul class="acts">
          <li data-test="act-fixed">
            <div class="acts__t">固定支出<small>{{ fixedSummary.text }}</small></div>
            <el-button
              v-if="fixedSummary.missing.length"
              size="small" type="warning" plain
              data-test="act-fixed-go"
              @click="emit('navigate', { tab: 'fixed-cost' })"
            >登錄</el-button>
            <el-tag v-else-if="fixedSummary.known" type="success" size="small">完成</el-tag>
          </li>
          <li data-test="act-salary">
            <div class="acts__t">薪資<small>{{ salarySum.text }}</small></div>
            <router-link v-if="salarySum.pending" to="/salary/settle" class="acts__link" data-test="act-salary-go">前往薪資結算</router-link>
            <el-tag v-else-if="salarySum.known" type="success" size="small">完成</el-tag>
          </li>
          <li v-if="signoff.state !== 'hidden'" data-test="act-signoff">
            <div class="acts__t">憑證<small>{{ signoff.text }}</small></div>
            <router-link v-if="signoff.state !== 'done'" to="/finance-signoffs" class="acts__link" data-test="act-signoff-go">收付款管理</router-link>
            <el-tag v-else type="success" size="small">完成</el-tag>
          </li>
        </ul>
      </section>
    </div>

    <!-- 其他指標（焦點月） -->
    <section class="kpis" data-test="kpis">
      <div class="kpi" data-test="kpi-personnel">
        <div class="kpi__lb">人事成本 · {{ fm }} 月</div>
        <div class="kpi__v" :class="{ 'kpi__v--na': personnel.na }">{{ personnel.value }}</div>
        <div class="kpi__sub">{{ personnel.sub }}</div>
        <button type="button" class="link" @click="emit('navigate', { tab: 'salary' })">看人事成本 →</button>
      </div>
      <div class="kpi" data-test="kpi-attendance">
        <div class="kpi__lb">教職員出勤率 · {{ fm }} 月</div>
        <div class="kpi__v" :class="{ 'kpi__v--na': attendance.na }">{{ attendance.value }}</div>
        <div class="kpi__sub">{{ attendance.sub }}</div>
        <button type="button" class="link" @click="emit('navigate', { tab: 'attendance' })">看教職員出勤 →</button>
      </div>
      <div class="kpi" data-test="kpi-ratio">
        <div class="kpi__lb">收支比 · {{ fm }} 月</div>
        <div class="kpi__v" :class="{ 'kpi__v--na': ratio.na }">{{ ratio.value }}</div>
        <div class="kpi__sub">{{ ratio.sub }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overview { display: flex; flex-direction: column; gap: var(--space-4); }

.ov-card {
  background: var(--surface-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4) var(--space-4);
  min-width: 0;
}
.ov-card__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.ov-card__title { margin: 0; font-size: var(--text-base); font-weight: 600; color: var(--text-primary); }
.ov-card__hint { font-size: var(--text-xs); color: var(--text-tertiary); }
.ov-error { padding: var(--space-2) 0; }
.ov-foot { margin: var(--space-2) 0 0; font-size: var(--text-xs); color: var(--text-tertiary); }

/* 收支等式：四項＋三個運算子；窄螢幕收成 2×2 */
.eq {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr) 24px minmax(0, 1fr) 24px minmax(0, 1.15fr);
  align-items: start;
  margin-top: var(--space-2);
}
.eq__op { font-size: var(--text-2xl); color: var(--text-tertiary); text-align: center; padding-top: 22px; }
.eq__label { display: flex; align-items: center; gap: 6px; font-size: var(--text-sm); color: var(--text-secondary); }
.eq__value {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  margin-top: 2px;
}
.eq__ytd { font-size: var(--text-xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.eq__cmp { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: var(--text-xs); color: var(--text-secondary); margin-top: 6px; }
.eq__cmp b { font-weight: 600; font-variant-numeric: tabular-nums; }
.tone--good { color: var(--color-success-darker, var(--color-success)); }
.tone--bad { color: var(--color-danger); }
.tone--flat { color: var(--text-tertiary); }
.eq__gaps {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--color-warning-darker);
  background: var(--color-warning-soft);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
}
.eq__gaps b { font-weight: 600; }
.eq__unknown { margin: var(--space-2) 0 0; font-size: var(--text-xs); line-height: 1.5; color: var(--text-secondary); }
.eq__term--net {
  background: var(--color-neutral-50);
  border-radius: var(--radius-md);
  padding: 8px 12px 10px;
  margin-top: -6px;
}
.eq__term--net .eq__value { color: var(--el-color-primary); }
.eq__netnote { margin: 4px 0 0; font-size: var(--text-xs); color: var(--color-warning-darker); }

.dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.dot--inc { background: var(--color-success); }
.dot--ref { background: var(--color-warning); }
.dot--exp { background: var(--color-danger); }
.dot--net { background: var(--color-info); }

.ov-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--space-4); }
.legend { display: flex; gap: var(--space-3); font-size: var(--text-xs); color: var(--text-secondary); }
.legend span { display: inline-flex; align-items: center; gap: 4px; }
.sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.sw--inc { background: var(--color-success); }
.sw--exp { background: var(--color-danger); }
.sw--net { background: var(--color-info); height: 2px; }
.chart-box { height: 280px; position: relative; margin-top: var(--space-2); }

/* 結帳狀態矩陣：形狀＋顏色雙重編碼（色覺障礙也讀得出） */
.mx-wrap { overflow-x: auto; margin-top: var(--space-2); }
.mx { width: 100%; border-collapse: collapse; font-size: var(--text-xs); }
.mx th { font-weight: 500; color: var(--text-tertiary); padding: 0 0 6px; text-align: center; }
.mx thead th.is-focus { color: var(--el-color-primary); font-weight: 700; }
.mx tbody th { text-align: left; color: var(--text-primary); font-size: var(--text-sm); white-space: nowrap; padding: 5px 6px 5px 0; font-weight: 400; }
.mx td { text-align: center; padding: 5px 0; border-top: 1px solid var(--el-border-color-lighter); }
.mx tbody th { border-top: 1px solid var(--el-border-color-lighter); }
.cell { width: 12px; height: 12px; border-radius: 50%; display: inline-block; vertical-align: middle; box-sizing: border-box; }
.cell--ok { background: var(--color-success); }
.cell--miss { border: 2px solid var(--color-warning); background: var(--surface-color); }
.cell--draft { border: 2px solid var(--color-warning); background: linear-gradient(90deg, var(--color-warning) 50%, var(--surface-color) 50%); }
.cell--prog { border: 2px solid var(--el-color-primary); background: linear-gradient(90deg, var(--el-color-primary) 50%, var(--surface-color) 50%); }
.cell--none { width: 10px; height: 2px; border-radius: 1px; background: var(--color-neutral-400); }
.cell--future { width: 0; height: 0; }
.cell--unknown { border: 1.5px dashed var(--color-neutral-400); background: transparent; }
.mx-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-2); }
.mx-legend span { display: inline-flex; align-items: center; gap: 4px; }

.acts { list-style: none; margin: var(--space-3) 0 0; padding: var(--space-3) 0 0; border-top: 1px solid var(--el-border-color-lighter); display: flex; flex-direction: column; gap: var(--space-2); }
.acts li { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-primary); }
.acts__t { min-width: 0; }
.acts__t small { display: block; font-size: var(--text-xs); color: var(--text-tertiary); }
.acts__link { font-size: var(--text-xs); color: var(--el-color-primary); white-space: nowrap; text-decoration: none; }
.acts__link:hover { text-decoration: underline; }

/* 其他指標：一條分隔列，不做三張同款卡片 */
.kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  background: var(--surface-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
}
.kpi { padding: var(--space-3) var(--space-4); border-left: 1px solid var(--el-border-color-lighter); min-width: 0; }
.kpi:first-child { border-left: 0; }
.kpi__lb { font-size: var(--text-xs); color: var(--text-tertiary); }
.kpi__v { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; margin-top: 2px; }
.kpi__v--na { font-size: var(--text-base); font-weight: 600; color: var(--text-tertiary); }
.kpi__sub { font-size: var(--text-xs); color: var(--text-secondary); margin-top: 2px; min-height: 1.5em; }

.link {
  background: none; border: none; padding: 0; font: inherit;
  font-size: var(--text-xs); color: var(--el-color-primary); cursor: pointer;
}
.link:hover { text-decoration: underline; }
.link:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (--to-lg) {
  .ov-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (--to-md) {
  .eq { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-3); }
  .eq__op { display: none; }
  .eq__term--net { grid-column: 1 / -1; margin-top: 0; }
  .kpis { grid-template-columns: minmax(0, 1fr); }
  .kpi { border-left: 0; border-top: 1px solid var(--el-border-color-lighter); }
  .kpi:first-child { border-top: 0; }
}
</style>
