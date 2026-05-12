import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/parent/api/childTimeline', () => ({
  fetchChildTimeline: vi.fn(),
}))

import { fetchChildTimeline } from '@/parent/api/childTimeline'
import MilestoneCarousel from '@/parent/components/MilestoneCarousel.vue'

describe('MilestoneCarousel', () => {
  beforeEach(() => {
    fetchChildTimeline.mockReset()
  })

  it('renders milestones from API', async () => {
    fetchChildTimeline.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'milestone-1',
            type: 'milestone',
            title: '5 歲生日',
            occurred_at: '2026-05-10',
            icon: '🎂',
          },
        ],
      },
    })
    const w = mount(MilestoneCarousel, { props: { studentId: 1 } })
    await flushPromises()
    expect(w.text()).toContain('5 歲生日')
    expect(fetchChildTimeline).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ types: 'milestone' }),
    )
  })

  it('shows empty state when no milestones', async () => {
    fetchChildTimeline.mockResolvedValueOnce({ data: { items: [] } })
    const w = mount(MilestoneCarousel, { props: { studentId: 2 } })
    await flushPromises()
    expect(w.text()).toContain('尚無')
  })

  it('refetches when studentId changes', async () => {
    fetchChildTimeline.mockResolvedValue({ data: { items: [] } })
    const w = mount(MilestoneCarousel, { props: { studentId: 1 } })
    await flushPromises()
    const callCount = fetchChildTimeline.mock.calls.length
    await w.setProps({ studentId: 2 })
    await flushPromises()
    expect(fetchChildTimeline.mock.calls.length).toBeGreaterThan(callCount)
  })
})
