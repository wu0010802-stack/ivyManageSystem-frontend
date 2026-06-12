import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/fees', () => ({ createFeeTemplate: vi.fn(), updateFeeTemplate: vi.fn() }))

import FeeTemplateDialog from '@/components/fees/FeeTemplateDialog.vue'

const ElDialogStub = { template: '<div><slot /><slot name="footer" /></div>' }
const STUBS = {
  'el-dialog': ElDialogStub,
  'el-select': true, 'el-option': true, 'el-input-number': true,
  'el-radio-group': true, 'el-radio': true,
} as const

function isBodyHidden(wrapper: ReturnType<typeof mount>, dataTest: string): boolean {
  const body = wrapper.find(`[data-test="${dataTest}"] .form-section__body`)
  if (!body.exists()) return false
  return (body.element as HTMLElement).style.display === 'none'
}

describe('FeeTemplateDialog — A+C', () => {
  it('新增模式：範本識別常駐展開', () => {
    const wrapper = mount(FeeTemplateDialog, {
      global: { plugins: [ElementPlus], stubs: STUBS },
      props: { modelValue: true, grades: [{ id: 1, name: '小班' }] },
    })
    expect(wrapper.text()).toContain('年級')
    expect(isBodyHidden(wrapper, 'section-identity')).toBe(false)
  })

  it('編輯模式：範本識別收合（不可變更欄位收起）', () => {
    const wrapper = mount(FeeTemplateDialog, {
      global: { plugins: [ElementPlus], stubs: STUBS },
      props: {
        modelValue: true,
        grades: [{ id: 1, name: '小班' }],
        template: { id: 5, grade_id: 1, school_year: 114, semester: 1, fee_type: 'registration', name: 'X', amount: 100 },
      },
    })
    expect(isBodyHidden(wrapper, 'section-identity')).toBe(true)
  })

  it('月費組成總和金額走 canonical 格式 NT$1,234（無空格）', () => {
    const wrapper = mount(FeeTemplateDialog, {
      global: { plugins: [ElementPlus], stubs: STUBS },
      props: {
        modelValue: true,
        grades: [{ id: 1, name: '小班' }],
        template: { id: 6, grade_id: 1, school_year: 114, semester: 1, fee_type: 'monthly', name: 'M', amount: 3000 },
      },
    })
    expect(wrapper.text()).toContain('NT$3,000')
    expect(wrapper.text()).not.toContain('NT$ ')
  })
})
