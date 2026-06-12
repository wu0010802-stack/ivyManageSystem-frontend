import { describe, it, expect } from 'vitest'
import { nonZeroLines, hasSeparateTransfer, type PayslipDetail } from '../salaryHistoryDetail'

const detail: PayslipDetail = {
  income: [
    { key: 'base_salary', label: '底薪', amount: 2950 },
    { key: 'supervisor_dividend', label: '主管紅利', amount: 5000 },
    { key: 'performance_bonus', label: '績效獎金', amount: 0 },
    { key: 'other_income', label: '其他（未分類）', amount: 0 },
  ],
  income_subtotal: 7950,
  separate_transfer: [
    { key: 'festival_bonus', label: '節慶獎金', amount: 26000 },
    { key: 'overtime_bonus', label: '超額獎金', amount: 0 },
  ],
  separate_subtotal: 26000,
  deductions: [{ key: 'labor_insurance_employee', label: '勞保', amount: 600 }],
  deduction_subtotal: 4604,
  net_salary: 3346,
}

describe('salaryHistoryDetail helper', () => {
  it('nonZeroLines 隱藏金額為 0 的列', () => {
    const keys = nonZeroLines(detail.income).map(l => l.key)
    expect(keys).toContain('supervisor_dividend')
    expect(keys).not.toContain('performance_bonus')
    expect(keys).not.toContain('other_income')
  })

  it('hasSeparateTransfer 在小計非零時為 true', () => {
    expect(hasSeparateTransfer(detail)).toBe(true)
  })

  it('hasSeparateTransfer 在小計為零時為 false', () => {
    expect(hasSeparateTransfer({ ...detail, separate_subtotal: 0 })).toBe(false)
  })
})
