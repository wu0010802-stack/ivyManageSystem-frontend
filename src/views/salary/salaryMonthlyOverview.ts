// 全員月總覽純函式 helper（篩選／欄位 preset／狀態標籤）。
// 型別一律取自 OpenAPI generated schema；summary 金額不在前端重算。
import type { Schema } from '@/api/_generated/typed'

export type OverviewEmployeeRow = Schema<'SalaryMonthlyEmployeeOut'>
export type OverviewOut = Schema<'SalaryMonthlyOverviewOut'>

export type EmployeeTypeFilter = 'all' | 'regular' | 'hourly'
export type StatusFilter = 'all' | 'finalized' | 'unfinalized' | 'needs_recalc' | 'manual_adjust'

export interface RowFilter {
  search: string
  type: string
  status: string
  abnormalOnly: boolean
}

/** 異常 = 有薪資紀錄但未封存，或待重算（警示色僅限這些狀態）。 */
export function isAbnormalRow(row: OverviewEmployeeRow): boolean {
  if (row.needs_recalc) return true
  return row.has_salary_record && !row.is_finalized
}

export function filterEmployeeRows(
  rows: OverviewEmployeeRow[],
  filter: RowFilter,
): OverviewEmployeeRow[] {
  let out = rows
  const kw = filter.search.trim().toLowerCase()
  if (kw) {
    out = out.filter(
      r =>
        r.employee_name.toLowerCase().includes(kw) ||
        r.employee_code.toLowerCase().includes(kw),
    )
  }
  if (filter.type !== 'all') out = out.filter(r => r.employee_type === filter.type)
  switch (filter.status) {
    case 'finalized':
      // 「已封存」語意上含無薪資紀錄以外全部封存列；純獎金列無封存概念，不列入未封存
      out = out.filter(r => !r.has_salary_record || r.is_finalized)
      break
    case 'unfinalized':
      out = out.filter(r => r.has_salary_record && !r.is_finalized)
      break
    case 'needs_recalc':
      out = out.filter(r => r.needs_recalc)
      break
    case 'manual_adjust':
      out = out.filter(r => r.has_manual_adjust)
      break
  }
  if (filter.abnormalOnly) out = out.filter(isAbnormalRow)
  return out
}

export type ColumnPreset = 'summary' | 'income' | 'deduction' | 'cost' | 'all'

/** 表格全部欄位（順序即顯示順序）。 */
export const ALL_COLUMNS = [
  'employee_code',
  'employee_name',
  'job_title',
  'employee_type',
  'gross_salary',
  'total_deduction',
  'net_salary',
  'unused_leave_payout',
  'base_transfer_amount',
  'salary_separate_transfer',
  'extra_bonus_amount',
  'salary_cash_payout',
  'employer_burden',
  'employer_cost',
  'status',
] as const

export type ColumnKey = (typeof ALL_COLUMNS)[number]

const PRESET_COLUMNS: Record<ColumnPreset, ColumnKey[]> = {
  summary: [
    'employee_code',
    'employee_name',
    'job_title',
    'employee_type',
    'gross_salary',
    'total_deduction',
    'net_salary',
    'base_transfer_amount',
    'salary_cash_payout',
    'status',
  ],
  income: [
    'employee_code',
    'employee_name',
    'employee_type',
    'gross_salary',
    'unused_leave_payout',
    'base_transfer_amount',
    'salary_separate_transfer',
    'extra_bonus_amount',
    'salary_cash_payout',
    'status',
  ],
  deduction: [
    'employee_code',
    'employee_name',
    'employee_type',
    'gross_salary',
    'total_deduction',
    'net_salary',
    'salary_cash_payout',
    'status',
  ],
  cost: [
    'employee_code',
    'employee_name',
    'employee_type',
    'gross_salary',
    'employer_burden',
    'employer_cost',
    'salary_cash_payout',
    'status',
  ],
  all: [...ALL_COLUMNS],
}

export function columnsForPreset(preset: ColumnPreset): ColumnKey[] {
  return PRESET_COLUMNS[preset]
}

export interface StatusTag {
  label: string
  type: 'success' | 'warning' | 'danger' | 'info'
}

export function statusTagsForRow(row: OverviewEmployeeRow): StatusTag[] {
  if (!row.has_salary_record) return [{ label: '僅表外獎金', type: 'info' }]
  const tags: StatusTag[] = row.is_finalized
    ? [{ label: '已封存', type: 'success' }]
    : [{ label: '未封存', type: 'warning' }]
  if (row.needs_recalc) tags.push({ label: '待重算', type: 'danger' })
  if (row.has_manual_adjust) tags.push({ label: '人工調整', type: 'info' })
  return tags
}
