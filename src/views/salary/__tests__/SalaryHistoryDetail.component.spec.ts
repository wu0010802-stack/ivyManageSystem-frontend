import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SalaryHistoryDetail from '../SalaryHistoryDetail.vue'
import type { PayslipDetail } from '../salaryHistoryDetail'

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
  deductions: [
    {
      key: 'health_insurance_employee', label: '健保', amount: 800,
      children: [{ key: 'supplementary_health_employee', label: '其中：二代健保補充保費', amount: 200, informational: true }],
    },
  ],
  deduction_subtotal: 4604,
  net_salary: 3346,
}

describe('SalaryHistoryDetail.vue', () => {
  it('渲染三區與實發', () => {
    const text = mount(SalaryHistoryDetail, { props: { detail } }).text()
    expect(text).toContain('主管紅利')
    expect(text).toContain('節慶獎金')
    expect(text).toContain('健保')
    expect(text).toContain('其中：二代健保補充保費')
    expect(text).toContain('實發')
  })

  it('隱藏金額為 0 的列（超額獎金/績效/other_income）', () => {
    const text = mount(SalaryHistoryDetail, { props: { detail } }).text()
    expect(text).not.toContain('超額獎金')
    expect(text).not.toContain('其他（未分類）')
  })

  it('另行轉帳小計為 0 時整區隱藏', () => {
    const zero: PayslipDetail = { ...detail, separate_transfer: [], separate_subtotal: 0 }
    const text = mount(SalaryHistoryDetail, { props: { detail: zero } }).text()
    expect(text).not.toContain('另行轉帳')
  })
})
