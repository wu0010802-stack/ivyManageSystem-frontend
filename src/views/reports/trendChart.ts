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

/**
 * 年度收支趨勢共用 builder（總覽＝三線；收支彙總＝四線含退款）。
 * - 依 period.cutoffMonth 截斷（cutSeries）
 * - 進行中的當月：最後一段虛線＋空心大點，tooltip 由 caller 註記「本月進行中」
 */
export function buildTrendChartData(
  trend: FinanceTrendRow[],
  period: ReportPeriod,
  opts: { includeRefund?: boolean } = {},
): ChartData<'line', (number | null)[]> {
  const specs: LineDatasetSpec[] = [
    { label: '收入', key: 'revenue', color: '#67c23a', bg: 'rgba(103,194,58,0.1)' },
    ...(opts.includeRefund
      ? [{ label: '退款', key: 'refund', color: '#e6a23c', bg: 'rgba(230,162,60,0.1)', dash: [4, 4] } as LineDatasetSpec]
      : []),
    { label: '支出', key: 'expense', color: '#f56c6c', bg: 'rgba(245,108,108,0.1)' },
    { label: '淨現金', key: 'net', color: '#409eff', bg: 'rgba(64,158,255,0.1)', width: 3 },
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
