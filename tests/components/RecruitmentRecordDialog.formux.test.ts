import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'

const ElDialogStub = { template: '<div><slot /><slot name="footer" /></div>' }
const STUBS = {
  'el-dialog': ElDialogStub,
  'el-date-picker': true,
  'el-select': true,
  'el-option': true,
  'el-autocomplete': true,
  'el-switch': true,
} as const

function makeForm(over: Record<string, unknown> = {}) {
  return {
    month: '', month_raw: null, visit_date: '', seq_no: '', child_name: '', grade: null, birthday: '',
    phone: '', district: '', address: '', source: '', referrer: '', has_deposit: false, deposit_collector: '',
    enrolled: false, transfer_term: false, no_deposit_reason: null, no_deposit_reason_detail: '',
    notes: '', parent_response: '', geocoding_consent: false, ...over,
  }
}
function mountDialog(formOver: Record<string, unknown> = {}) {
  const form = makeForm(formOver)
  const wrapper = mount(RecruitmentRecordDialog, {
    global: { plugins: [ElementPlus], stubs: STUBS },
    props: { visible: true, mode: 'add', form },
  })
  return { wrapper, form }
}
function isBodyHidden(wrapper: ReturnType<typeof mountDialog>['wrapper'], dataTest: string): boolean {
  const body = wrapper.find(`[data-test="${dataTest}"] .form-section__body`)
  return (body.element as HTMLElement).style.display === 'none'
}

describe('RecruitmentRecordDialog — A+C 收合', () => {
  it('聯絡/預繳/備註 收合區預設收合', () => {
    const { wrapper } = mountDialog()
    expect(isBodyHidden(wrapper, 'section-contact')).toBe(true)
    expect(isBodyHidden(wrapper, 'section-deposit')).toBe(true)
    expect(isBodyHidden(wrapper, 'section-notes')).toBe(true)
  })
  it('geocoding 同意常駐可見（el-checkbox 不收合）', () => {
    const { wrapper } = mountDialog()
    expect(wrapper.find('.el-checkbox').exists()).toBe(true)
  })
  // 代表欄位自 district 改為 address：行政區已於 2026-08-28 自表單移除。
  it('applyValidationErrors 展開含錯區段（聯絡欄錯→聯絡區展開 + 徽章）', async () => {
    const { wrapper } = mountDialog()
    ;(wrapper.vm as unknown as { applyValidationErrors: (p: string[]) => void }).applyValidationErrors(['address'])
    await wrapper.vm.$nextTick()
    expect(isBodyHidden(wrapper, 'section-contact')).toBe(false)
    const badge = wrapper.find('[data-test="section-contact"] .form-section__badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('1')
  })
})
