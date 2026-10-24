import type { Chart, ChartData, Plugin } from 'chart.js'
import { firstMonthWithData, type FinanceTrendRow } from './financeTrend'
import { monthState, type ReportPeriod } from './useReportPeriod'
import { monthRangeText } from './reportFormat'

export const TREND_MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)

/** 四條趨勢線的線色。單一事實來源是 design-tokens.css 的 --color-*（2026-08-25 稽核 C2）。 */
export interface TrendPalette {
  revenue: string
  refund: string
  expense: string
  net: string
}

const PALETTE_TOKENS: Record<keyof TrendPalette, string> = {
  revenue: '--color-success',
  refund: '--color-warning',
  expense: '--color-danger',
  net: '--color-info',
}

// fallback 對齊 design-tokens.css 現值（trendChart.test.ts 有 drift guard 禁 EP 預設色），
// 僅供讀不到 computed style 的環境（jsdom 測試）與 token 意外缺值時退場。
const PALETTE_FALLBACK: TrendPalette = {
  revenue: '#10b981',
  refund: '#f59e0b',
  expense: '#ef4444',
  net: '#3b82f6',
}

export function readCssVar(name: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name)
}

/** 解析圖表用色（canvas 吃不到 CSS 變數，繪圖前解析；readVar 可注入供測試）。 */
export function resolveTrendPalette(readVar: (name: string) => string = readCssVar): TrendPalette {
  const out = { ...PALETTE_FALLBACK }
  for (const key of Object.keys(PALETTE_TOKENS) as Array<keyof TrendPalette>) {
    const v = readVar(PALETTE_TOKENS[key]).trim()
    if (v) out[key] = v
  }
  return out
}

/** #rgb／#rrggbb → rgba(r,g,b,alpha)；非 hex（意外 token 值）原樣退回。 */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  let hex = m[1]
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  const n = parseInt(hex, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/**
 * 每月收支圖（2026-10-12 報表改版，提案 F3）：收入／支出長條＋淨現金折線。
 *
 * - 年度內第一筆收支之前的月份＝「無收支紀錄」：資料 null（不畫 0），由 monthBandsPlugin 畫灰帶
 * - 本月（進行中）：長條改淡底＋實線框，淨現金不畫點（未完的月份不連線）
 * - 未來月：null
 * - 折線 tension 0：月度加總是離散值，平滑曲線會在兩月之間造出不存在的爬升
 */
export interface MonthlyMoneyChartMeta {
  /** 灰帶涵蓋的月份（1-based，連續），無則空陣列 */
  noRecordMonths: number[]
  /** 本月（進行中）1-based，無則 null */
  currentMonth: number | null
}

export function buildMonthlyMoneyChart(
  trend: FinanceTrendRow[],
  period: ReportPeriod,
  opts: { palette?: TrendPalette } = {},
): { data: ChartData<'bar', (number | null)[]>; meta: MonthlyMoneyChartMeta } {
  const pal = opts.palette ?? resolveTrendPalette()
  const byMonth = new Map(trend.map(r => [r.month, r]))
  const first = firstMonthWithData(trend)
  const noRecordMonths: number[] = []
  let currentMonth: number | null = null

  const revenue: (number | null)[] = []
  const expense: (number | null)[] = []
  const net: (number | null)[] = []
  for (let m = 1; m <= 12; m++) {
    const state = monthState(period, m)
    const row = byMonth.get(m)
    if (state === 'current') currentMonth = m
    const beforeFirst = first == null ? state !== 'future' : m < first
    if (state === 'future' || (beforeFirst && state !== 'current')) {
      if (beforeFirst && state !== 'future') noRecordMonths.push(m)
      revenue.push(null); expense.push(null); net.push(null)
      continue
    }
    revenue.push(row?.revenue ?? 0)
    expense.push(row?.expense ?? 0)
    net.push(state === 'current' ? null : (row?.net ?? 0))
  }

  const isCurrent = (i: number) => currentMonth != null && i === currentMonth - 1
  const barColors = (color: string) => ({
    backgroundColor: TREND_MONTH_LABELS.map((_, i) => (isCurrent(i) ? withAlpha(color, 0.18) : color)),
    borderColor: color,
    borderWidth: TREND_MONTH_LABELS.map((_, i) => (isCurrent(i) ? 1.5 : 0)),
  })

  const data = {
    labels: TREND_MONTH_LABELS,
    datasets: [
      { type: 'bar' as const, label: '收入', data: revenue, ...barColors(pal.revenue), borderRadius: 2, maxBarThickness: 18, order: 2 },
      { type: 'bar' as const, label: '支出', data: expense, ...barColors(pal.expense), borderRadius: 2, maxBarThickness: 18, order: 2 },
      {
        type: 'line' as const, label: '淨現金', data: net,
        borderColor: pal.net, backgroundColor: pal.net, borderWidth: 2,
        pointRadius: 3, pointBackgroundColor: '#fff', pointBorderColor: pal.net,
        tension: 0, spanGaps: false, order: 1,
      },
    ],
    // 混合圖（bar＋type:'line' dataset）在 vue-chartjs <Bar> 上型別仍標 'bar'
  } as unknown as ChartData<'bar', (number | null)[]>

  return { data, meta: { noRecordMonths, currentMonth } }
}

export interface MonthBandsOptions {
  noRecordMonths?: number[]
  focusMonth?: number | null
  currentMonth?: number | null
}

/**
 * chart.js 外掛：在資料底下畫「無收支紀錄」灰帶與月份焦點底色，在上方標「進行中」。
 * 以 `options.plugins.monthBands` 傳參；顏色讀 design tokens（canvas 吃不到 CSS 變數）。
 */
export const monthBandsPlugin: Plugin<'bar', MonthBandsOptions> = {
  id: 'monthBands',
  beforeDatasetsDraw(chart: Chart<'bar'>, _args: unknown, options: MonthBandsOptions) {
    const { ctx, chartArea, scales } = chart
    const x = scales.x
    if (!x || !chartArea) return
    const half = (x.width / 12) / 2
    const band = (m: number) => {
      const c = x.getPixelForValue(m - 1)
      return [c - half, c + half] as const
    }
    ctx.save()
    const focus = options.focusMonth
    if (focus) {
      const [l, r] = band(focus)
      ctx.fillStyle = withAlpha(readCssVar('--color-primary').trim() || '#0284c7', 0.08)
      ctx.fillRect(l + 1, chartArea.top, r - l - 2, chartArea.bottom - chartArea.top)
    }
    const none = options.noRecordMonths ?? []
    if (none.length) {
      const [l] = band(none[0])
      const [, r] = band(none[none.length - 1])
      ctx.fillStyle = readCssVar('--neutral-100').trim() || '#f1f5f9'
      ctx.fillRect(l + 1, chartArea.top, r - l - 2, chartArea.bottom - chartArea.top)
      ctx.fillStyle = readCssVar('--text-tertiary').trim() || '#64748b'
      ctx.font = '12px Inter, "PingFang TC", "Noto Sans TC", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${monthRangeText(none)}無收支紀錄`, (l + r) / 2, (chartArea.top + chartArea.bottom) / 2)
    }
    ctx.restore()
  },
  afterDatasetsDraw(chart: Chart<'bar'>, _args: unknown, options: MonthBandsOptions) {
    const cur = options.currentMonth
    const x = chart.scales.x
    if (!cur || !x || !chart.chartArea) return
    const { ctx } = chart
    ctx.save()
    ctx.fillStyle = readCssVar('--color-primary').trim() || '#0284c7'
    ctx.font = '11px Inter, "PingFang TC", "Noto Sans TC", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('進行中', x.getPixelForValue(cur - 1), chart.chartArea.top + 12)
    ctx.restore()
  },
}
