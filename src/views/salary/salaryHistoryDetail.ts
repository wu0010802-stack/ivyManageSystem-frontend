// 薪資歷史明細純展示 helper。型別 hand-define 對齊 payslip_detail（與 SalaryHistoryPanel
// 既有 HistoryRow hand-define 風格一致）；後端 build_history_breakdown 已組好結構。
export interface BreakdownLine {
  key: string
  label: string
  amount: number
  note?: string | null
  informational?: boolean
  children?: BreakdownLine[] | null
}

export interface PayslipDetail {
  income: BreakdownLine[]
  income_subtotal: number
  separate_transfer: BreakdownLine[]
  separate_subtotal: number
  deductions: BreakdownLine[]
  deduction_subtotal: number
  net_salary: number
  unused_leave_payout: number
  base_transfer_amount: number
}

/** 過濾掉金額為 0 的列（other_income、未發生的獎金/扣款不顯示，降噪）。 */
export function nonZeroLines(lines: BreakdownLine[]): BreakdownLine[] {
  return lines.filter(l => l.amount !== 0)
}

/** 另行轉帳整區是否顯示（小計為 0 則整區隱藏）。 */
export function hasSeparateTransfer(detail: PayslipDetail): boolean {
  return detail.separate_subtotal !== 0
}
