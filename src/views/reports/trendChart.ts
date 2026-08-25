import type { ChartData, ScriptableLineSegmentContext } from 'chart.js'
import { cutSeries, type FinanceTrendRow } from './financeTrend'
import type { ReportPeriod } from './useReportPeriod'

export const TREND_MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)

/** 今年且當月有實際資料時回傳該月的 0-based dataIndex（供空心點/虛線段標示），否則 null。 */
export function inProgressIndex(period: ReportPeriod): number | null {
  if (!period.isCurrentYear) return null
  if (period.lastActualMonth == null || period.lastActualMonth !== period.cutoffMonth) return null
  return period.cutoffMonth - 1
}

interface LineDatasetSpec {
  label: string
  key: 'revenue' | 'refund' | 'expense' | 'net'
  color: string
  bg: string
  width?: number
  dash?: number[]
}

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

function readCssVar(name: string): string {
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

/** Y 軸千元縮寫：與 KPI 卡同用 NT$ 前綴（2026-08-25 稽核 m8，取代裸 '$'）。 */
export function formatAxisTick(v: number | string): string {
  return 'NT$' + (Number(v) / 1000).toFixed(0) + 'k'
}

/**
 * 年度收支趨勢共用 builder（總覽＝三線；收支彙總＝四線含退款）。
 * - 依 period.cutoffMonth 截斷（cutSeries）
 * - 進行中的當月：最後一段虛線＋空心大點，tooltip 由 caller 註記「本月進行中」
 */
export function buildTrendChartData(
  trend: FinanceTrendRow[],
  period: ReportPeriod,
  opts: { includeRefund?: boolean; palette?: TrendPalette } = {},
): ChartData<'line', (number | null)[]> {
  const pal = opts.palette ?? resolveTrendPalette()
  const specs: LineDatasetSpec[] = [
    { label: '收入', key: 'revenue', color: pal.revenue, bg: withAlpha(pal.revenue, 0.1) },
    ...(opts.includeRefund
      ? [{ label: '退款', key: 'refund', color: pal.refund, bg: withAlpha(pal.refund, 0.1), dash: [4, 4] } as LineDatasetSpec]
      : []),
    { label: '支出', key: 'expense', color: pal.expense, bg: withAlpha(pal.expense, 0.1) },
    { label: '淨現金', key: 'net', color: pal.net, bg: withAlpha(pal.net, 0.1), width: 3 },
  ]
  const progIdx = inProgressIndex(period)
  return {
    labels: TREND_MONTH_LABELS,
    datasets: specs.map(s => ({
      label: s.label,
      data: cutSeries(trend, s.key, period.cutoffMonth),
      borderColor: s.color,
      backgroundColor: s.bg,
      borderWidth: s.width ?? 2,
      borderDash: s.dash,
      fill: s.key === 'revenue',
      tension: 0.3,
      // 進行中的當月：空心大點
      pointRadius: (ctx: { dataIndex: number }) => (progIdx != null && ctx.dataIndex === progIdx ? 5 : 3),
      pointBackgroundColor: (ctx: { dataIndex: number }) =>
        progIdx != null && ctx.dataIndex === progIdx ? 'transparent' : s.color,
      pointBorderColor: s.color,
      // 進行中的當月：最後一段虛線
      segment: {
        borderDash: (ctx: ScriptableLineSegmentContext) =>
          progIdx != null && ctx.p1DataIndex === progIdx ? [5, 5] : s.dash,
      },
    })),
  } as unknown as ChartData<'line', (number | null)[]>
}
