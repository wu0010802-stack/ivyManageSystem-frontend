import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EmployeeFormSalary from '@/components/employee/EmployeeFormSalary.vue'

const STUBS = { 'el-input-number': true, 'el-switch': true, 'el-tooltip': true } as const

function mountForm(props: Record<string, unknown> = {}) {
  return mount(EmployeeFormSalary, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    props: { form: {}, ...props },
  })
}
function isBodyHidden(wrapper: ReturnType<typeof mountForm>, dataTest: string): boolean {
  const body = wrapper.find(`[data-test="${dataTest}"] .form-section__body`)
  if (!body.exists()) return false
  return (body.element as HTMLElement).style.display === 'none'
}

describe('EmployeeFormSalary — A+C', () => {
  it('主要欄位常駐、進階特殊狀況收合', () => {
    const wrapper = mountForm()
    expect(wrapper.text()).toContain('底薪')
    expect(wrapper.text()).toContain('銀行代碼')
    expect(isBodyHidden(wrapper, 'section-advanced')).toBe(true)
  })

  it('isReadonly 時底薪呈現唯讀鎖頭', () => {
    const wrapper = mountForm({ form: { base_salary: 30000 }, isReadonly: true })
    expect(wrapper.find('.readonly-text').exists()).toBe(true)
  })
})
