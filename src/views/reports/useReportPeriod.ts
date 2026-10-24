import { lastMonthWithData, type FinanceTrendRow } from './financeTrend'

/**
 * 報表模組「資料截止月」單一事實來源（spec §2）。
 *
 * 根治兩個既有問題：
 * 1. 資料懸崖：圖表/表格以 cutoffMonth 截斷，未來月不畫 0。
 * 2. MoM 錨點 bug：lastMonthWithData 會把「只有預登錄固定支出」的未來月當有資料
 *    （錨點跑到 12 月 → 恆 0.0%）；此處以 cutoffMonth 夾住，MoM 再退一步錨定
 *    「最後完整月」（進行中的當月 vs 完整上月會誤導）。
 */
export interface ReportPeriod {
  isCurrentYear: boolean
  cutoffMonth: number
  lastActualMonth: number | null
  lastCompleteMonth: number | null
}

export function computeReportPeriod(
  year: number,
  trend?: FinanceTrendRow[],
  today: Date = new Date(),
): ReportPeriod {
  const realYear = today.getFullYear()
  const isCurrentYear = year === realYear
  const cutoffMonth = year < realYear ? 12 : year > realYear ? 0 : today.getMonth() + 1

  const rawLast = trend && trend.length ? lastMonthWithData(trend) : null
  const clamped = rawLast == null ? null : Math.min(rawLast, cutoffMonth)
  const lastActualMonth = clamped != null && clamped >= 1 ? clamped : null

  let lastCompleteMonth: number | null = null
  if (lastActualMonth != null) {
    const candidate = isCurrentYear
      ? Math.min(lastActualMonth, today.getMonth()) // getMonth() = 當月-1
      : lastActualMonth
    lastCompleteMonth = candidate >= 1 ? candidate : null
  }

  return { isCurrentYear, cutoffMonth, lastActualMonth, lastCompleteMonth }
}

/** 某月相對於資料截止月的位置：已過／本月（進行中）／未來。 */
export type MonthState = 'past' | 'current' | 'future'

export function monthState(period: ReportPeriod, month: number): MonthState {
  if (month > period.cutoffMonth) return 'future'
  if (period.isCurrentYear && month === period.cutoffMonth) return 'current'
  return 'past'
}

/**
 * 月份焦點預設值（2026-10-12 報表改版）：最近一個完整月 → 最後有資料的月 →
 * 截止月（今年＝當月、過去年＝12）→ 1。全模組共用，URL 未指定 month 時採用。
 */
export function defaultFocusMonth(period: ReportPeriod): number {
  return period.lastCompleteMonth
    ?? period.lastActualMonth
    ?? (period.cutoffMonth >= 1 ? period.cutoffMonth : 1)
}
