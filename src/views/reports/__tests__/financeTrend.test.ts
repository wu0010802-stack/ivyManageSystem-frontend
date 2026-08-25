import { describe, it, expect } from 'vitest'
import {
  sumTrendUpTo,
  futurePreloggedExpense,
  cutSeries,
  deltaKind,
  pctChange,
  type FinanceTrendRow,
} from '../financeTrend'

// 模擬 dev DB 實況：1–7 月有實際收支，8–12 月只有預登錄固定支出 500,000
function makeTrend(): FinanceTrendRow[] {
  const rows: FinanceTrendRow[] = []
  for (let m = 1; m <= 12; m++) {
    if (m <= 7) {
      rows.push({ month: m, revenue: 1000 * m, refund: 10 * m, expense: 500 * m, net: 1000 * m - 10 * m - 500 * m })
    } else {
      rows.push({ month: m, revenue: 0, refund: 0, expense: 500000, net: -500000 })
    }
  }
  return rows
}

describe('sumTrendUpTo', () => {
  it('只加總 month ≤ uptoMonth 的列', () => {
    const s = sumTrendUpTo(makeTrend(), 7)
    expect(s.revenue).toBe(1000 * (1 + 2 + 3 + 4 + 5 + 6 + 7))
    expect(s.expense).toBe(500 * (1 + 2 + 3 + 4 + 5 + 6 + 7))
    expect(s.refund).toBe(10 * 28)
  })
  it('uptoMonth = 0 回全零', () => {
    expect(sumTrendUpTo(makeTrend(), 0)).toEqual({ revenue: 0, refund: 0, expense: 0, net: 0 })
  })
  it('空 trend 回全零', () => {
    expect(sumTrendUpTo([], 12)).toEqual({ revenue: 0, refund: 0, expense: 0, net: 0 })
  })
})

describe('futurePreloggedExpense', () => {
  it('回傳 afterMonth 之後 expense > 0 的月份與總額', () => {
    const f = futurePreloggedExpense(makeTrend(), 7)
    expect(f.months).toEqual([8, 9, 10, 11, 12])
    expect(f.total).toBe(500000 * 5)
  })
  it('無未來預登錄時回空', () => {
    const f = futurePreloggedExpense(makeTrend(), 12)
    expect(f.months).toEqual([])
    expect(f.total).toBe(0)
  })
})

describe('cutSeries', () => {
  it('回傳固定 12 格；month > cutoffMonth 一律 null（不畫），≤ cutoff 保留原值（含真實 0）', () => {
    const s = cutSeries(makeTrend(), 'expense', 7)
    expect(s).toHaveLength(12)
    expect(s[6]).toBe(500 * 7)
    expect(s[7]).toBeNull() // 8 月預登錄 500000 也不畫
    expect(s[11]).toBeNull()
  })
  it('trend 缺某月時該格為 null', () => {
    const sparse: FinanceTrendRow[] = [{ month: 2, revenue: 5, refund: 0, expense: 0, net: 5 }]
    const s = cutSeries(sparse, 'revenue', 12)
    expect(s[0]).toBeNull()
    expect(s[1]).toBe(5)
  })
})

describe('pctChange（2026-08-25 稽核 C1：負基期方向）', () => {
  it('正基期：(150-100)/100 = +50%', () => {
    expect(pctChange(150, 100)).toBeCloseTo(50)
  })
  it('基期為 0 → null（無資料，不顯示）', () => {
    expect(pctChange(100, 0)).toBeNull()
  })
  it('負基期惡化（更負）必須是負值/down：淨現金 -50 萬 → -176.8 萬 = -253.6%', () => {
    // 帶號分母的舊實作會回 +253.7%（綠色「改善」），與事實相反
    const v = pctChange(-1768000, -500000)
    expect(v).toBeCloseTo(-253.6)
    expect(deltaKind(v)).toBe('down')
  })
  it('負基期改善（虧損收斂）必須是正值/up：-500 → -100 = +80%', () => {
    const v = pctChange(-100, -500)
    expect(v).toBeCloseTo(80)
    expect(deltaKind(v)).toBe('up')
  })
})

describe('deltaKind', () => {
  it('null → null（無資料，不顯示）', () => expect(deltaKind(null)).toBeNull())
  it('|v| < 0.1 → flat（含 0 與 ±0.05）', () => {
    expect(deltaKind(0)).toBe('flat')
    expect(deltaKind(0.05)).toBe('flat')
    expect(deltaKind(-0.09)).toBe('flat')
  })
  it('v ≥ 0.1 → up；v ≤ -0.1 → down', () => {
    expect(deltaKind(0.1)).toBe('up')
    expect(deltaKind(-23.1)).toBe('down')
  })
})
