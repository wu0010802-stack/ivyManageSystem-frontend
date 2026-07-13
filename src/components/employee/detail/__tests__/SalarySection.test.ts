import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SalarySection from '../SalarySection.vue'

const mountSection = (employee: Record<string, unknown>, canFix = true) =>
  mount(SalarySection, { props: { employee, canFix }, global: { plugins: [ElementPlus] } })

describe('SalarySection 底薪未設定就地補登', () => {
  it('正職底薪 0 → 顯示「尚未設定」＋「前往補登」，點擊 emit fix-salary', async () => {
    const w = mountSection({ employee_type: 'regular', base_salary: 0 })
    expect(w.text()).toContain('尚未設定')
    const btn = w.findAll('button').find((b) => b.text().includes('前往補登'))
    await btn!.trigger('click')
    expect(w.emitted('fix-salary')).toHaveLength(1)
  })
  it('canFix=false（無編輯權）→ 顯示尚未設定但無補登按鈕', () => {
    const w = mountSection({ employee_type: 'regular', base_salary: 0 }, false)
    expect(w.text()).toContain('尚未設定')
    expect(w.findAll('button').some((b) => b.text().includes('前往補登'))).toBe(false)
  })
  it('底薪 null（遮罩）→ 維持「無檢視權限」，不顯示補登', () => {
    const w = mountSection({ employee_type: 'regular', base_salary: null })
    expect(w.text()).toContain('無檢視權限')
    expect(w.text()).not.toContain('尚未設定')
  })
  it('有底薪 → 正常金額顯示', () => {
    const w = mountSection({ employee_type: 'regular', base_salary: 32000 })
    expect(w.text()).toContain('32,000')
  })
})
