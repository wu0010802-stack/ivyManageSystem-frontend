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

describe('未公布的學期', () => {
  const mountItem = (item: Record<string, unknown>) => mount(CycleTimelineItem, {
    props: { item: { cycle_id: 2, ...item }, fetchDetail: vi.fn() },
    global: { stubs: { ItemRadarChart: true, ScoreItemsTable: true } },
  })

  it('不畫展開箭頭（列本身 disabled，箭頭只會誤導成點得開）', () => {
    const w = mountItem({ is_visible: false, summary_status: 'in_progress' })
    expect(w.get('button.row').attributes('disabled')).toBeDefined()
    expect(w.find('.chevron').exists()).toBe(false)
    expect(w.get('.status-chip').text()).toBe('考核進行中')
  })

  it('已公布的學期仍有展開箭頭', () => {
    const w = mountItem({ is_visible: true, total_score: 88, grade: 'A' })
    expect(w.find('.chevron').exists()).toBe(true)
  })
})
