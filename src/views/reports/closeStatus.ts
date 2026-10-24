/**
 * 結帳狀態矩陣（2026-10-12 報表改版，提案 F2／F5）。
 *
 * 一列一類（收入入帳／固定支出／薪資封存）、一格一月，讓「支出為什麼是 0」跟數字
 * 擺在一起看。純函式，資料來源：
 * - 收入：finance-summary 的 monthly_trend
 * - 固定支出：monthly-fixed-costs（需 VENDOR_PAYMENT_READ；查不到 ≠ 沒登錄）
 * - 薪資：dashboard 的 salary_monthly（employee_count＝已封存人數、
 *   employee_count_pending＝草稿／待重算人數）
 *
 * 硬性原則：查不到的資料一律標 unknown，絕不當成「已完成」或「未完成」。
 */
import type { FinanceTrendRow } from './financeTrend'
import { monthState, type ReportPeriod } from './useReportPeriod'
import { monthRangeText } from './reportFormat'

/** ok 已完成／miss 未完成／draft 草稿／prog 進行中／none 無紀錄／future 未來月／unknown 無法確認 */
export type CloseCell = 'ok' | 'miss' | 'draft' | 'prog' | 'none' | 'future' | 'unknown'

export interface SalaryMonthRow {
  month: number
  employee_count?: number | null
  employee_count_pending?: number | null
}

export type FixedCostStatus =
  | { state: 'loading' }
  | { state: 'forbidden' }
  | { state: 'error' }
  | { state: 'ok'; registered: number[] }

export type UnknownReason = 'loading' | 'forbidden' | 'error'

export interface CloseMatrix {
  revenue: CloseCell[]
  fixedCost: CloseCell[]
  salary: CloseCell[]
  fixedCostReason: UnknownReason | null
  salaryReason: UnknownReason | null
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function buildCloseMatrix(input: {
  trend: FinanceTrendRow[]
  period: ReportPeriod
  /** null＝dashboard 載入失敗或尚未載入（見 salaryReason） */
  salaryMonthly: SalaryMonthRow[] | null
  salaryReason?: UnknownReason | null
  fixedCost: FixedCostStatus
}): CloseMatrix {
  const { trend, period, salaryMonthly, fixedCost } = input
  const byMonth = new Map(trend.map(r => [r.month, r]))
  const salaryByMonth = new Map((salaryMonthly ?? []).map(r => [r.month, r]))
  const registered = fixedCost.state === 'ok' ? new Set(fixedCost.registered) : null
  const fixedCostReason: UnknownReason | null = fixedCost.state === 'ok' ? null : fixedCost.state
  const salaryReason: UnknownReason | null = salaryMonthly ? null : (input.salaryReason ?? 'error')

  const revenue = MONTHS.map((m): CloseCell => {
    const s = monthState(period, m)
    if (s === 'future') return 'future'
    if (s === 'current') return 'prog'
    const r = byMonth.get(m)
    return r && ((r.revenue || 0) !== 0 || (r.refund || 0) !== 0) ? 'ok' : 'none'
  })

  const fixed = MONTHS.map((m): CloseCell => {
    const s = monthState(period, m)
    if (!registered) return s === 'future' ? 'future' : 'unknown'
    if (registered.has(m)) return 'ok'
    return s === 'future' ? 'future' : 'miss'
  })

  const salary = MONTHS.map((m): CloseCell => {
    const s = monthState(period, m)
    if (s === 'future') return 'future'
    if (!salaryMonthly) return 'unknown'
    if (s === 'current') return 'prog'
    const row = salaryByMonth.get(m)
    if ((row?.employee_count || 0) > 0) return 'ok'
    if ((row?.employee_count_pending || 0) > 0) return 'draft'
    return 'miss'
  })

  return { revenue, fixedCost: fixed, salary, fixedCostReason, salaryReason }
}

/** 某月支出側缺了哪些（給收支等式與月度明細「支出待補」用）；只列確知的缺項。 */
export function monthExpenseGaps(matrix: CloseMatrix, month: number): string[] {
  const i = month - 1
  const out: string[] = []
  if (matrix.fixedCost[i] === 'miss') out.push(`固定支出 ${month} 月未登錄`)
  if (matrix.salary[i] === 'miss') out.push(`薪資 ${month} 月未封存`)
  if (matrix.salary[i] === 'draft') out.push(`薪資 ${month} 月仍是草稿`)
  return out
}

/** 某月支出側「查不到」的項目（無權限／讀取失敗／載入中）：不能當成支出已完整。 */
export function monthExpenseUnknowns(matrix: CloseMatrix, month: number): string[] {
  const i = month - 1
  const out: string[] = []
  if (matrix.fixedCost[i] === 'unknown') out.push('固定支出登錄狀態')
  if (matrix.salary[i] === 'unknown') out.push('薪資封存狀態')
  return out
}

export function monthsWith(cells: CloseCell[], ...states: CloseCell[]): number[] {
  return cells.flatMap((c, i) => (states.includes(c) ? [i + 1] : []))
}

export const UNKNOWN_REASON_TEXT: Record<UnknownReason, string> = {
  loading: '載入中',
  forbidden: '無法確認（需要廠商付款讀取權限）',
  error: '無法確認（讀取失敗）',
}

/** 固定支出列的一行摘要：「1–10 月未登錄」／「已登錄到 9 月」／無法確認原因。 */
export function fixedCostSummary(matrix: CloseMatrix): { text: string; missing: number[]; known: boolean } {
  if (matrix.fixedCostReason) {
    return { text: UNKNOWN_REASON_TEXT[matrix.fixedCostReason], missing: [], known: false }
  }
  const missing = monthsWith(matrix.fixedCost, 'miss')
  if (missing.length) return { text: `${monthRangeText(missing)}未登錄`, missing, known: true }
  const done = monthsWith(matrix.fixedCost, 'ok')
  return { text: done.length ? '截至本月皆已登錄' : '尚無需登錄的月份', missing, known: true }
}

/** 薪資列的一行摘要：「1 月草稿 33 人 · 2–9 月未結算」。 */
export function salarySummary(
  matrix: CloseMatrix,
  salaryMonthly: SalaryMonthRow[] | null,
): { text: string; pending: boolean; known: boolean } {
  if (matrix.salaryReason || !salaryMonthly) {
    return { text: UNKNOWN_REASON_TEXT[matrix.salaryReason ?? 'error'], pending: false, known: false }
  }
  const byMonth = new Map(salaryMonthly.map(r => [r.month, r]))
  const parts: string[] = []
  for (const m of monthsWith(matrix.salary, 'draft')) {
    parts.push(`${m} 月草稿 ${byMonth.get(m)?.employee_count_pending ?? 0} 人`)
  }
  const miss = monthsWith(matrix.salary, 'miss')
  if (miss.length) parts.push(`${monthRangeText(miss)}未結算`)
  if (!parts.length) {
    const done = monthsWith(matrix.salary, 'ok')
    return { text: done.length ? `已封存到 ${done[done.length - 1]} 月` : '尚無需結算的月份', pending: false, known: true }
  }
  return { text: parts.join(' · '), pending: true, known: true }
}
