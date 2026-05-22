import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FunnelColumn from '../FunnelColumn.vue'

const baseCards = [
  { visit_id: 1, child_name: '甲', current_stage: 'visited' as const },
  { visit_id: 2, child_name: '乙', current_stage: 'visited' as const },
]

describe('FunnelColumn.vue', () => {
  it('renders title + count', () => {
    const wrapper = mount(FunnelColumn, {
      props: {
        stage: 'visited',
        cards: baseCards,
        title: '已訪視',
        accentColor: '#909399',
        canDragSet: new Set([1, 2]),
      },
    })
    expect(wrapper.text()).toContain('已訪視')
    expect(wrapper.text()).toContain('2')
  })

  it('shows empty placeholder when cards is empty', () => {
    const wrapper = mount(FunnelColumn, {
      props: {
        stage: 'visited',
        cards: [],
        title: '已訪視',
        accentColor: '#909399',
        canDragSet: new Set(),
      },
    })
    expect(wrapper.find('.funnel-column-empty').exists()).toBe(true)
  })

  it('renders one FunnelCard per card', () => {
    const wrapper = mount(FunnelColumn, {
      props: {
        stage: 'visited',
        cards: baseCards,
        title: '已訪視',
        accentColor: '#909399',
        canDragSet: new Set([1, 2]),
      },
    })
    expect(wrapper.findAll('.funnel-card').length).toBe(2)
  })
})
