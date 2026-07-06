import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ElDescriptions, ElDescriptionsItem, ElTag } from 'element-plus'
import SalarySection from '@/components/employee/detail/SalarySection.vue'

const mountWith = (employee: Record<string, unknown>, standardSalary: number | null = null) =>
  mount(SalarySection, {
    props: { employee, standardSalary },
    global: {
      components: { ElDescriptions, ElDescriptionsItem, ElTag },
    },
  })

describe('SalarySection 顯示規範', () => {
  it('正職：顯示底薪、不渲染時薪列', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: 45300, hourly_rate: 0, insurance_salary_level: 45300 })
    expect(w.text()).toContain('45,300')
    expect(w.text()).not.toContain('時薪')
  })
  it('時薪制：顯示時薪、不渲染底薪列', () => {
    const w = mountWith({ employee_type: 'hourly', base_salary: 0, hourly_rate: 200 })
    expect(w.text()).toContain('時薪')
    expect(w.text()).not.toContain('底薪')
  })
  it('後端遮罩（null）→ 顯示無檢視權限，不得顯示 0 或 NaN', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: null, insurance_salary_level: null })
    expect(w.text()).toContain('無檢視權限')
    expect(w.text()).not.toContain('NaN')
  })
  it('投保級距 0 → 未設定', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: 30000, insurance_salary_level: 0 })
    expect(w.text()).toContain('未設定')
  })
  it('特殊旗標只列啟用者', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: 30000, health_exempt: true, no_employment_insurance: false })
    expect(w.text()).toContain('健保豁免')
    expect(w.text()).not.toContain('免就保')
  })
  it('標準薪比較：高於標準顯示 tag', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: 50000 }, 40000)
    expect(w.text()).toContain('高於標準')
  })
})
