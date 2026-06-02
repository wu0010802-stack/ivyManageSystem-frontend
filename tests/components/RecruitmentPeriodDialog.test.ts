import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RecruitmentPeriodDialog from '@/components/recruitment/RecruitmentPeriodDialog.vue'

const ElDialogStub = { template: '<div><slot /><slot name="footer" /></div>' }
const STUBS = { 'el-dialog': ElDialogStub, 'el-input-number': true } as const

function makeForm(over: Record<string, unknown> = {}) {
  return {
    period_name: '', visit_count: 0, deposit_count: 0, enrolled_count: 0, transfer_term_count: 0,
    effective_deposit_count: 0, not_enrolled_deposit: 0, enrolled_after_school: 0, sort_order: 0, notes: '', ...over,
  }
}
function mountDialog(formOver: Record<string, unknown> = {}) {
  return mount(RecruitmentPeriodDialog, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    props: { visible: true, mode: 'add', form: makeForm(formOver) },
  })
}
function isBodyHidden(wrapper: ReturnType<typeof mountDialog>, dataTest: string): boolean {
  const body = wrapper.find(`[data-test="${dataTest}"] .form-section__body`)
  return (body.element as HTMLElement).style.display === 'none'
}

describe('RecruitmentPeriodDialog — A+C', () => {
  it('期間名稱與統計數據常駐可見、其他收合', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('期間名稱')
    expect(wrapper.text()).toContain('參觀人數')
    expect(isBodyHidden(wrapper, 'section-other')).toBe(true)
  })
  it('點「其他」標題可展開', async () => {
    const wrapper = mountDialog()
    await wrapper.find('[data-test="section-other"] .form-section__header').trigger('click')
    expect(isBodyHidden(wrapper, 'section-other')).toBe(false)
  })
})
