import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/activity', () => ({
  createRegistration: vi.fn(),
  getSupplies: vi.fn(() => Promise.resolve({ data: { supplies: [] } })),
}))

import RegistrationCreateDialog from '@/components/activity/RegistrationCreateDialog.vue'

const ElDialogStub = { template: '<div><slot /><slot name="footer" /></div>' }
const STUBS = { 'el-dialog': ElDialogStub, 'el-select': true, 'el-option': true, 'el-date-picker': true } as const

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(RegistrationCreateDialog, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    props: { modelValue: true, schoolYear: 114, semester: 1, ...props },
  })
}
function isBodyHidden(wrapper: ReturnType<typeof mountDialog>, dataTest: string): boolean {
  const body = wrapper.find(`[data-test="${dataTest}"] .form-section__body`)
  if (!body.exists()) return false
  return (body.element as HTMLElement).style.display === 'none'
}

describe('RegistrationCreateDialog — A+C', () => {
  it('核心常駐（含課程/用品）、Email/備註 收合', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('學生姓名')
    expect(wrapper.text()).toContain('課程')
    expect(isBodyHidden(wrapper, 'section-extra')).toBe(true)
  })
})
