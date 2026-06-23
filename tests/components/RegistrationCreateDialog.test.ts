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

// 對齊後端 invariant（公開/家長/後台一致）：報名至少要有一門課程或一項用品。
// 過去 isValid 只檢查姓名/生日/班級 → 空品項仍可送出，被後端 400 退回。
describe('RegistrationCreateDialog — 至少一項課程或用品', () => {
  type Wrapper = ReturnType<typeof mountDialog>

  async function fillRequired(wrapper: Wrapper) {
    const form = (wrapper.vm as unknown as { form: Record<string, unknown> }).form
    form.name = '王小明'
    form.birthday = '2020-01-01'
    form.class_ = '大班'
    await wrapper.vm.$nextTick()
  }

  function submitDisabled(wrapper: Wrapper): boolean {
    const btn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('確認新增'))
    if (!btn) throw new Error('找不到「確認新增」按鈕')
    return (btn.element as HTMLButtonElement).disabled
  }

  it('姓名/生日/班級齊全但無課程無用品 → 不可送出', async () => {
    const wrapper = mountDialog()
    await fillRequired(wrapper)
    expect(submitDisabled(wrapper)).toBe(true)
  })

  it('只選一項用品即可送出', async () => {
    const wrapper = mountDialog()
    await fillRequired(wrapper)
    const form = (wrapper.vm as unknown as { form: Record<string, unknown> }).form
    form.supplyNames = ['畫具包']
    await wrapper.vm.$nextTick()
    expect(submitDisabled(wrapper)).toBe(false)
  })

  it('只選一門課程即可送出', async () => {
    const wrapper = mountDialog()
    await fillRequired(wrapper)
    const form = (wrapper.vm as unknown as { form: Record<string, unknown> }).form
    form.courseNames = ['美術']
    await wrapper.vm.$nextTick()
    expect(submitDisabled(wrapper)).toBe(false)
  })
})
