import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import StudentEditDialog from '@/components/student/StudentEditDialog.vue'

// el-dialog teleports content to body; stub it to render inline so we can query the form.
const ElDialogStub = {
  name: 'ElDialog',
  template: '<div class="el-dialog-stub"><slot /><slot name="footer" /></div>',
}
const STUBS = {
  'el-dialog': ElDialogStub,
  'el-date-picker': true,
  'el-select': true,
  'el-option': true,
  'el-radio-group': true,
  'el-radio': true,
  'el-switch': true,
} as const

function mountDialog(props: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  return mount(StudentEditDialog, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    props: { visible: true, mode: 'create', ...props },
  })
}

function isBodyHidden(wrapper: ReturnType<typeof mountDialog>, dataTest: string): boolean {
  const body = wrapper.find(`[data-test="${dataTest}"] .form-section__body`)
  return (body.element as HTMLElement).style.display === 'none'
}

describe('StudentEditDialog', () => {
  it('學生編號呈現唯讀自動配號提示、非輸入框', () => {
    const wrapper = mountDialog()
    const auto = wrapper.find('[data-test="student-id-auto"]')
    expect(auto.exists()).toBe(true)
    expect(auto.text()).toContain('自動配號')
  })

  it('收合區段預設收合（家長/政府申報不可見）', () => {
    const wrapper = mountDialog()
    expect(isBodyHidden(wrapper, 'section-parent')).toBe(true)
    expect(isBodyHidden(wrapper, 'section-gov')).toBe(true)
  })

  it('applyValidationErrors 展開含錯區段（電話錯→家長區展開 + 徽章）', async () => {
    const wrapper = mountDialog()
    ;(wrapper.vm as unknown as { applyValidationErrors: (p: string[]) => void }).applyValidationErrors(['parent_phone'])
    await wrapper.vm.$nextTick()
    expect(isBodyHidden(wrapper, 'section-parent')).toBe(false)
    const badge = wrapper.find('[data-test="section-parent"] .form-section__badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1')
  })
})
