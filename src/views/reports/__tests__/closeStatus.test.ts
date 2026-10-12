import { describe, it, expect } from 'vitest'
import { computeReportPeriod } from '../useReportPeriod'
import {
  buildCloseMatrix, fixedCostSummary, monthExpenseGaps, salarySummary, type SalaryMonthRow,
} from '../closeStatus'
import type { FinanceTrendRow } from '../financeTrend'

const TODAY = new Date(2026, 9, 12) // 10 月進行中
const zero = (m: number): FinanceTrendRow => ({ month: m, revenue: 0, refund: 0, expense: 0, net: 0 })
function trend(): FinanceTrendRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    if (m === 8) return { month: 8, revenue: 90396, refund: 0, expense: 4, net: 90392 }
    if (m === 9) return { month: 9, revenue: 1965811, refund: 23000, expense: 94, net: 1942717 }
    return zero(m)
  })
}
function salary(overrides: Record<number, Partial<SalaryMonthRow>> = {}): SalaryMonthRow[] {
  return Array.from({ length: 12 }, (_, i) => ({ month: i + 1, employee_count: 0, employee_count_pending: 0, ...overrides[i + 1] }))
}
const period = () => computeReportPeriod(2026, trend(), TODAY)

describe('buildCloseMatrix', () => {
  it('收入：有收退款＝完成、沒有＝無紀錄、本月＝進行中、未來＝空', () => {
    const m = buildCloseMatrix({ trend: trend(), period: period(), salaryMonthly: salary(), fixedCost: { state: 'ok', registered: [] } })
    expect(m.revenue.slice(6, 12)).toEqual(['none', 'ok', 'ok', 'prog', 'future', 'future'])
  })

  it('固定支出：已登錄＝完成（含預登錄的未來月）、截止月以內沒登錄＝未完成', () => {
    const m = buildCloseMatrix({ trend: trend(), period: period(), salaryMonthly: salary(), fixedCost: { state: 'ok', registered: [1, 2, 12] } })
    expect(m.fixedCost[0]).toBe('ok')
    expect(m.fixedCost[2]).toBe('miss')
    expect(m.fixedCost[9]).toBe('miss') // 本月也要登錄
    expect(m.fixedCost[10]).toBe('future')
    expect(m.fixedCost[11]).toBe('ok')
  })

  it('固定支出查不到（無權限／失敗／載入中）一律 unknown，不當成未登錄', () => {
    for (const state of ['forbidden', 'error', 'loading'] as const) {
      const m = buildCloseMatrix({ trend: trend(), period: period(), salaryMonthly: salary(), fixedCost: { state } })
      expect(m.fixedCost.slice(0, 10).every(c => c === 'unknown')).toBe(true)
      expect(m.fixedCostReason).toBe(state)
      expect(fixedCostSummary(m).known).toBe(false)
      expect(fixedCostSummary(m).missing).toEqual([])
    }
  })

  it('薪資：已封存＝完成、只有草稿＝草稿、都沒有＝未完成、本月＝進行中；資料讀不到＝unknown', () => {
    const m = buildCloseMatrix({
      trend: trend(), period: period(),
      salaryMonthly: salary({ 1: { employee_count_pending: 33 }, 2: { employee_count: 30 } }),
      fixedCost: { state: 'ok', registered: [] },
    })
    expect(m.salary.slice(0, 4)).toEqual(['draft', 'ok', 'miss', 'miss'])
    expect(m.salary[9]).toBe('prog')
    const unknown = buildCloseMatrix({ trend: trend(), period: period(), salaryMonthly: null, fixedCost: { state: 'ok', registered: [] } })
    expect(unknown.salary[2]).toBe('unknown')
    expect(salarySummary(unknown, null).known).toBe(false)
  })
})

describe('摘要文字', () => {
  it('固定支出與薪資的一行摘要（區間合併）', () => {
    const m = buildCloseMatrix({
      trend: trend(), period: period(),
      salaryMonthly: salary({ 1: { employee_count_pending: 33 } }),
      fixedCost: { state: 'ok', registered: [] },
    })
    expect(fixedCostSummary(m).text).toBe('1–10 月未登錄')
    expect(salarySummary(m, salary({ 1: { employee_count_pending: 33 } })).text).toBe('1 月草稿 33 人 · 2–9 月未結算')
  })

  it('monthExpenseGaps 只列確知的缺項', () => {
    const m = buildCloseMatrix({
      trend: trend(), period: period(),
      salaryMonthly: salary({ 9: { employee_count: 30 } }),
      fixedCost: { state: 'ok', registered: [] },
    })
    expect(monthExpenseGaps(m, 9)).toEqual(['固定支出 9 月未登錄'])
    const unknown = buildCloseMatrix({ trend: trend(), period: period(), salaryMonthly: null, fixedCost: { state: 'error' } })
    expect(monthExpenseGaps(unknown, 9)).toEqual([])
  })
})
