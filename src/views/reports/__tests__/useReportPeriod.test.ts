import { describe, it, expect } from 'vitest'
import { computeReportPeriod } from '../useReportPeriod'
import type { FinanceTrendRow } from '../financeTrend'

const TODAY = new Date(2026, 6, 10) // 2026-07-10（月為 0-based）

// 1–7 月有實際收支；8–12 月只有預登錄固定支出（expense 500000）
function trendWithPrelogged(): FinanceTrendRow[] {
  const rows: FinanceTrendRow[] = []
  for (let m = 1; m <= 12; m++) {
    rows.push(m <= 7
      ? { month: m, revenue: 100, refund: 0, expense: 50, net: 50 }
      : { month: m, revenue: 0, refund: 0, expense: 500000, net: -500000 })
  }
  return rows
}

describe('computeReportPeriod — cutoffMonth', () => {
  it('檢視今年 → 當前真實月份', () => {
    expect(computeReportPeriod(2026, undefined, TODAY).cutoffMonth).toBe(7)
  })
  it('過去年 → 12；未來年 → 0', () => {
    expect(computeReportPeriod(2025, undefined, TODAY).cutoffMonth).toBe(12)
    expect(computeReportPeriod(2027, undefined, TODAY).cutoffMonth).toBe(0)
  })
})

describe('computeReportPeriod — lastActualMonth（回歸：預登錄未來月不得拉高錨點）', () => {
  it('未來月只有預登錄固定支出時，lastActualMonth 被 cutoff 夾住 = 7，不是 12', () => {
    const p = computeReportPeriod(2026, trendWithPrelogged(), TODAY)
    expect(p.lastActualMonth).toBe(7)
  })
  it('過去年 → lastMonthWithData 原值（cutoff=12 不夾）', () => {
    const p = computeReportPeriod(2025, trendWithPrelogged(), TODAY)
    expect(p.lastActualMonth).toBe(12) // 過去年檢視時 12 月的 500000 屬真實歷史資料
  })
  it('無 trend 或全空 → null', () => {
    expect(computeReportPeriod(2026, undefined, TODAY).lastActualMonth).toBeNull()
    expect(computeReportPeriod(2026, [], TODAY).lastActualMonth).toBeNull()
  })
  it('未來年 → null（cutoff=0）', () => {
    expect(computeReportPeriod(2027, trendWithPrelogged(), TODAY).lastActualMonth).toBeNull()
  })
})

describe('computeReportPeriod — lastCompleteMonth（MoM 錨點）', () => {
  it('今年、當月有資料 → 錨定上一個完整月（7 月進行中 → 錨 6 月）', () => {
    const p = computeReportPeriod(2026, trendWithPrelogged(), TODAY)
    expect(p.lastCompleteMonth).toBe(6)
  })
  it('過去年 → 錨定 lastActualMonth（12）', () => {
    const p = computeReportPeriod(2025, trendWithPrelogged(), TODAY)
    expect(p.lastCompleteMonth).toBe(12)
  })
  it('今年 1 月（無上一個完整月）→ null', () => {
    const jan = new Date(2026, 0, 15)
    const trend: FinanceTrendRow[] = [{ month: 1, revenue: 100, refund: 0, expense: 0, net: 100 }]
    expect(computeReportPeriod(2026, trend, jan).lastCompleteMonth).toBeNull()
  })
  it('無資料 → null', () => {
    expect(computeReportPeriod(2026, [], TODAY).lastCompleteMonth).toBeNull()
  })
})
