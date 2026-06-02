import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/studentMeasurements', () => ({ createMeasurement: vi.fn(), updateMeasurement: vi.fn() }))

import MeasurementEditorDialog from '@/components/student/MeasurementEditorDialog.vue'

const ElDialogStub = { template: '<div><slot /><slot name="footer" /></div>' }
const STUBS = { 'el-dialog': ElDialogStub, 'el-date-picker': true, 'el-input-number': true } as const

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(MeasurementEditorDialog, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    props: { modelValue: true, studentId: 1, ...props },
  })
}
function isBodyHidden(wrapper: ReturnType<typeof mountDialog>, dataTest: string): boolean {
  const body = wrapper.find(`[data-test="${dataTest}"] .form-section__body`)
  if (!body.exists()) return false
  return (body.element as HTMLElement).style.display === 'none'
}

describe('MeasurementEditorDialog — A+C', () => {
  it('生長量測常駐、視力+備註 收合', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('身高')
    expect(isBodyHidden(wrapper, 'section-extra')).toBe(true)
  })
})
