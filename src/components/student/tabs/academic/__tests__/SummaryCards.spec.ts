import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('@/api/studentRecords', () => ({
  getAcademicSummary: vi.fn().mockResolvedValue({ data: null }),
}))

import SummaryCards from '../SummaryCards.vue'

describe('SummaryCards 無障礙互動', () => {
  it('將全部摘要卡渲染為原生按鈕並保留導向事件', async () => {
    const wrapper = mount(SummaryCards, {
      props: { studentId: 1 },
      global: { directives: { loading: () => {} } },
    })
    await flushPromises()

    const cards = wrapper.findAll('button.card')
    expect(cards).toHaveLength(4)
    expect(cards.every((card) => card.attributes('type') === 'button')).toBe(true)

    await cards[0].trigger('click')
    await cards[1].trigger('click')
    expect(wrapper.emitted('jump-tab')).toEqual([['attendance']])
    expect(wrapper.emitted('jump-section')).toEqual([['leave']])
  })
})
