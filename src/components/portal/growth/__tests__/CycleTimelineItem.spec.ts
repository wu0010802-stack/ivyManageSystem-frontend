import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CycleTimelineItem from '../CycleTimelineItem.vue'

describe('考核明細重新載入', () => {
  it('第一次失敗可直接重試，成功後清除錯誤並呈現明細', async () => {
    const fetchDetail = vi.fn().mockRejectedValueOnce(new Error('失敗')).mockResolvedValue({ data: { score_items: [] } })
    const wrapper = mount(CycleTimelineItem, {
      props: { item: { cycle_id: 1, is_visible: true }, fetchDetail },
      global: { stubs: { ItemRadarChart: true, ScoreItemsTable: true, ElIcon: true } },
    })
    await wrapper.get('button.row').trigger('click')
    await flushPromises()
    expect(wrapper.get('button.row').attributes('aria-expanded')).toBe('true')
    await wrapper.get('[data-test="detail-retry"]').trigger('click')
    await flushPromises()
    expect(fetchDetail).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.error').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ScoreItemsTable' }).exists()).toBe(true)
  })
})
