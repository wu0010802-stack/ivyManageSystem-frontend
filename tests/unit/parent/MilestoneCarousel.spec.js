import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/parent/api/childMilestones', () => ({
  fetchChildMilestones: vi.fn(),
  reactToMilestone: vi.fn(),
  REACTION_EMOJI: { like: '👍', love: '🥰', celebrate: '🎉' },
}))

import { fetchChildMilestones } from '@/parent/api/childMilestones'
import MilestoneCarousel from '@/parent/components/MilestoneCarousel.vue'

describe('MilestoneCarousel', () => {
  beforeEach(() => {
    fetchChildMilestones.mockReset()
  })

  it('renders milestones from API', async () => {
    fetchChildMilestones.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 1,
            title: '5 歲生日',
            achieved_on: '2026-05-10',
            icon: '🎂',
            parent_reaction: null,
          },
        ],
      },
    })
    const w = mount(MilestoneCarousel, { props: { studentId: 1 } })
    await flushPromises()
    expect(w.text()).toContain('5 歲生日')
    expect(fetchChildMilestones).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ limit: 10 }),
    )
  })

  it('shows empty state when no milestones', async () => {
    fetchChildMilestones.mockResolvedValueOnce({ data: { items: [] } })
    const w = mount(MilestoneCarousel, { props: { studentId: 2 } })
    await flushPromises()
    expect(w.text()).toContain('尚無')
  })

  it('refetches when studentId changes', async () => {
    fetchChildMilestones.mockResolvedValue({ data: { items: [] } })
    const w = mount(MilestoneCarousel, { props: { studentId: 1 } })
    await flushPromises()
    const callCount = fetchChildMilestones.mock.calls.length
    await w.setProps({ studentId: 2 })
    await flushPromises()
    expect(fetchChildMilestones.mock.calls.length).toBeGreaterThan(callCount)
  })
})
