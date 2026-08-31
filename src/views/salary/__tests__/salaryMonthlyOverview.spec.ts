import { describe, it, expect } from 'vitest'
import {
  filterEmployeeRows,
  isAbnormalRow,
  columnsForPreset,
  statusTagsForRow,
  type OverviewEmployeeRow,
} from '../salaryMonthlyOverview'

const row = (over: Partial<OverviewEmployeeRow> = {}): OverviewEmployeeRow => ({
  employee_id: 1,
  employee_code: 'A001',
  employee_name: '王小明',
  job_title: '教師',
  employee_type: 'regular',
  has_salary_record: true,
  salary_record_id: 10,
  gross_salary: 40000,
  total_deduction: 3000,
  net_salary: 37000,
  unused_leave_payout: 0,
  base_transfer_amount: 37000,
  salary_separate_transfer: 0,
  extra_bonus_amount: 0,
  salary_cash_payout: 37000,
  labor_insurance_employer: 0,
  health_insurance_employer: 0,
  pension_employer: 0,
  employer_burden: 0,
  employer_cost: 40000,
  is_finalized: true,
  needs_recalc: false,
  has_manual_adjust: false,
  extra_bonus_items: [],
  payslip_detail: null,
  ...over,
})

describe('filterEmployeeRows', () => {
  const rows = [
    row({ employee_id: 1, employee_code: 'A001', employee_name: '王小明' }),
    row({ employee_id: 2, employee_code: 'B002', employee_name: '李時薪', employee_type: 'hourly' }),
    row({ employee_id: 3, employee_code: 'C003', employee_name: '陳未封', is_finalized: false }),
    row({ employee_id: 4, employee_code: 'D004', employee_name: '林重算', is_finalized: false, needs_recalc: true }),
    row({ employee_id: 5, employee_code: 'E005', employee_name: '張手調', has_manual_adjust: true }),
  ]

  it('姓名關鍵字過濾', () => {
    const out = filterEmployeeRows(rows, { search: '小明', type: 'all', status: 'all', abnormalOnly: false })
    expect(out.map(r => r.employee_id)).toEqual([1])
  })

  it('工號關鍵字過濾（不分大小寫）', () => {
    const out = filterEmployeeRows(rows, { search: 'b002', type: 'all', status: 'all', abnormalOnly: false })
    expect(out.map(r => r.employee_id)).toEqual([2])
  })

  it('員工類型過濾', () => {
    const out = filterEmployeeRows(rows, { search: '', type: 'hourly', status: 'all', abnormalOnly: false })
    expect(out.map(r => r.employee_id)).toEqual([2])
  })

  it('狀態過濾：已封存／未封存／待重算／人工調整', () => {
    const q = (status: string) =>
      filterEmployeeRows(rows, { search: '', type: 'all', status, abnormalOnly: false }).map(r => r.employee_id)
    expect(q('finalized')).toEqual([1, 2, 5])
    expect(q('unfinalized')).toEqual([3, 4])
    expect(q('needs_recalc')).toEqual([4])
    expect(q('manual_adjust')).toEqual([5])
  })

  it('只看異常＝未封存或待重算', () => {
    const out = filterEmployeeRows(rows, { search: '', type: 'all', status: 'all', abnormalOnly: true })
    expect(out.map(r => r.employee_id)).toEqual([3, 4])
  })
})

describe('isAbnormalRow', () => {
  it('未封存或待重算為異常；純表外獎金列不算', () => {
    expect(isAbnormalRow(row({ is_finalized: false }))).toBe(true)
    expect(isAbnormalRow(row({ needs_recalc: true }))).toBe(true)
    expect(isAbnormalRow(row())).toBe(false)
    expect(isAbnormalRow(row({ has_salary_record: false, is_finalized: false }))).toBe(false)
  })
})

describe('columnsForPreset', () => {
  it('摘要 preset 不含雇主成本欄', () => {
    const cols = columnsForPreset('summary')
    expect(cols).toContain('employee_code')
    expect(cols).toContain('salary_cash_payout')
    expect(cols).not.toContain('employer_cost')
  })

  it('成本 preset 含雇主負擔與完整人事成本', () => {
    const cols = columnsForPreset('cost')
    expect(cols).toContain('employer_burden')
    expect(cols).toContain('employer_cost')
  })

  it('全部 preset 含所有 15 欄', () => {
    expect(columnsForPreset('all').length).toBe(15)
  })
})

describe('statusTagsForRow', () => {
  it('封存綠、未封存與待重算為警示、人工調整標示', () => {
    expect(statusTagsForRow(row())).toEqual([{ label: '已封存', type: 'success' }])
    expect(statusTagsForRow(row({ is_finalized: false }))).toEqual([{ label: '未封存', type: 'warning' }])
    expect(statusTagsForRow(row({ is_finalized: false, needs_recalc: true }))).toEqual([
      { label: '未封存', type: 'warning' },
      { label: '待重算', type: 'danger' },
    ])
    expect(statusTagsForRow(row({ has_manual_adjust: true }))).toEqual([
      { label: '已封存', type: 'success' },
      { label: '人工調整', type: 'info' },
    ])
  })

  it('純表外獎金列顯示專屬標籤', () => {
    expect(statusTagsForRow(row({ has_salary_record: false }))).toEqual([
      { label: '僅表外獎金', type: 'info' },
    ])
  })
})
