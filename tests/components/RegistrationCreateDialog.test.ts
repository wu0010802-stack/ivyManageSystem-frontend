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

describe('RegistrationCreateDialog — 候補課程不納入目前預估應繳', () => {
  it('零名額且允候補的已選課不計入目前預估應繳，另列候補未計費與轉正預估', async () => {
    const wrapper = mountDialog({
      courseOptions: [
        {
          id: 1,
          name: '額滿美術',
          price: 1200,
          remaining: 0,
          capacity: 10,
          allow_waitlist: true,
        },
        {
          id: 2,
          name: '有位律動',
          price: 800,
          remaining: 2,
          capacity: 10,
          allow_waitlist: true,
        },
      ],
    })
    const form = (wrapper.vm as unknown as {
      form: { courseNames: string[] }
    }).form
    form.courseNames = ['額滿美術', '有位律動']
    await wrapper.vm.$nextTick()

    const currentEstimate = wrapper.get('[data-test="current-estimated-total"]')
    expect(currentEstimate.text()).toContain('目前預估應繳')
    expect(currentEstimate.text()).toContain('NT$ 800')
    expect(wrapper.text()).toContain('實際依送出時名額')
    expect(wrapper.get('[data-test="estimated-total"]').text()).toContain('NT$ 2,000')
    const waitlist = wrapper.get('[data-test="waitlist-unbilled"]')
    expect(waitlist.text()).toContain('候補未計費')
    expect(waitlist.text()).toContain('額滿美術')
    expect(waitlist.text()).toContain('NT$ 1,200')
  })

  it('仍有名額的已選課全部計入目前預估應繳，不顯示候補預估', async () => {
    const wrapper = mountDialog({
      courseOptions: [
        {
          id: 2,
          name: '有位律動',
          price: 800,
          remaining: 2,
          capacity: 10,
          allow_waitlist: true,
        },
      ],
    })
    const form = (wrapper.vm as unknown as {
      form: { courseNames: string[] }
    }).form
    form.courseNames = ['有位律動']
    await wrapper.vm.$nextTick()

    const currentEstimate = wrapper.get('[data-test="current-estimated-total"]')
    expect(currentEstimate.text()).toContain('目前預估應繳')
    expect(currentEstimate.text()).toContain('NT$ 800')
    expect(wrapper.find('[data-test="estimated-total"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="waitlist-unbilled"]').exists()).toBe(false)
  })
})
