import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TimelineItem from '@/components/student/timeline/TimelineItem.vue'

describe('TimelineItem (admin)', () => {
  it('renders title, date, and icon', () => {
    const w = mount(TimelineItem, {
      props: {
        item: {
          id: 'milestone-1',
          type: 'milestone',
          occurred_at: '2026-05-10',
          title: '5 歲生日',
          summary: '今天和同學一起切蛋糕',
          icon: '🎂',
          is_highlight: false,
        },
      },
    })
    expect(w.text()).toContain('5 歲生日')
    expect(w.text()).toContain('2026-05-10')
    expect(w.text()).toContain('🎂')
  })

  it('shows highlight badge when is_highlight=true', () => {
    const w = mount(TimelineItem, {
      props: {
        item: {
          id: 'observation-1',
          type: 'observation',
          occurred_at: '2026-05-09',
          title: '亮點觀察',
          summary: '',
          icon: '📝',
          is_highlight: true,
        },
      },
    })
    expect(w.text()).toContain('亮點')
  })

  it('omits summary div when summary empty', () => {
    const w = mount(TimelineItem, {
      props: {
        item: {
          id: 'attendance-1',
          type: 'attendance',
          occurred_at: '2026-05-08',
          title: '請假',
          summary: '',
          icon: '📅',
          is_highlight: false,
        },
      },
    })
    expect(w.find('.summary').exists()).toBe(false)
  })
})
