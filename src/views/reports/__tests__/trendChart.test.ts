import { describe, it, expect } from 'vitest'
import { buildTrendChartData, inProgressIndex } from '../trendChart'
import { computeReportPeriod } from '../useReportPeriod'
import type { FinanceTrendRow } from '../financeTrend'

const TODAY = new Date(2026, 6, 10)
function trend(): FinanceTrendRow[] {
  const rows: FinanceTrendRow[] = []
  for (let m = 1; m <= 12; m++) {
    rows.push(m <= 7
      ? { month: m, revenue: 100 * m, refund: m, expense: 50 * m, net: 49 * m }
      : { month: m, revenue: 0, refund: 0, expense: 500000, net: -500000 })
  }
  return rows
}

describe('buildTrendChartData', () => {
  it('預設三條線（收入/支出/淨現金），8–12 月為 null（資料懸崖修復）', () => {
    const p = computeReportPeriod(2026, trend(), TODAY)
    const data = buildTrendChartData(trend(), p)
    expect(data.datasets.map(d => d.label)).toEqual(['收入', '支出', '淨現金'])
    const revenue = data.datasets[0].data
    expect(revenue[6]).toBe(700)
    expect(revenue[7]).toBeNull()
    expect(revenue[11]).toBeNull()
  })
  it('includeRefund 開啟時四條線', () => {
    const p = computeReportPeriod(2026, trend(), TODAY)
    const data = buildTrendChartData(trend(), p, { includeRefund: true })
    expect(data.datasets.map(d => d.label)).toEqual(['收入', '退款', '支出', '淨現金'])
  })
})

describe('inProgressIndex', () => {
  it('今年且當月有實際資料 → cutoffMonth-1', () => {
    expect(inProgressIndex(computeReportPeriod(2026, trend(), TODAY))).toBe(6)
  })
  it('過去年 → null；當月無資料 → null', () => {
    expect(inProgressIndex(computeReportPeriod(2025, trend(), TODAY))).toBeNull()
    const juneOnly: FinanceTrendRow[] = [{ month: 6, revenue: 1, refund: 0, expense: 0, net: 1 }]
    expect(inProgressIndex(computeReportPeriod(2026, juneOnly, TODAY))).toBeNull()
  })
})
