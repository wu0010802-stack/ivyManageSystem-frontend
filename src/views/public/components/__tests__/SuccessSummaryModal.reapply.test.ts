import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SuccessSummaryModal from '../SuccessSummaryModal.vue'

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    visible: true,
    message: '報名資料已送出',
    studentName: '王小明',
    parentPhone: '0912345678',
    selectedCourses: [{ name: '幼兒體適能', price: 2600 }],
    selectedSupplies: [],
    totalAmount: 2600,
    queryToken: 'tok_ABC',
    editUrl: 'https://ivy.example.tw/public.html#/activity/query?token=tok_ABC',
    copyHint: '',
    email: '',
    ...overrides,
  }
}

function mountModal(overrides: Record<string, unknown> = {}) {
  return mount(SuccessSummaryModal, { props: { summary: makeSummary(overrides) } })
}

let writeText: ReturnType<typeof vi.fn>
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

describe('幫另一位寶貝報名', () => {
  it('提供接續報名入口', () => {
    const wrapper = mountModal()
    expect(wrapper.find('[data-test="reapply-button"]').exists()).toBe(true)
  })

  it('未複製查詢碼時吃同一道守門：第一次只提醒，第二次才 emit', async () => {
    const wrapper = mountModal()
    const btn = wrapper.get('[data-test="reapply-button"]')

    await btn.trigger('click')
    expect(wrapper.emitted('reapply')).toBeUndefined()
    expect(wrapper.find('.close-nudge').exists()).toBe(true)

    await btn.trigger('click')
    expect(wrapper.emitted('reapply')).toHaveLength(1)
    // 接續報名不是關閉，不應同時觸發 close
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('已複製查詢碼後直接 emit，不再攔一次', async () => {
    const wrapper = mountModal()
    await wrapper.get('.token-control .btn-copy').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.get('[data-test="reapply-button"]').trigger('click')
    expect(wrapper.emitted('reapply')).toHaveLength(1)
  })

  it('無查詢碼（未產碼）時不守門，直接 emit', async () => {
    const wrapper = mountModal({ queryToken: '', editUrl: '' })
    await wrapper.get('[data-test="reapply-button"]').trigger('click')
    expect(wrapper.emitted('reapply')).toHaveLength(1)
  })
})
