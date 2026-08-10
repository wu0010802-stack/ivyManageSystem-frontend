import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/parent/api/childMilestones', () => ({
  fetchChildMilestones: vi.fn(),
  reactToMilestone: vi.fn(),
  acknowledgeMilestone: vi.fn(),
  REACTION_EMOJI: { like: '👍', love: '🥰', celebrate: '🎉' },
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { fetchChildMilestones, reactToMilestone } from '@/parent/api/childMilestones'
import { toast } from '@/parent/utils/toast'
import MilestoneCarousel from '@/parent/components/MilestoneCarousel.vue'
import MilestoneCard from '@/parent/components/MilestoneCard.vue'

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
    // 2026-08-10：空狀態從裸文字「尚無里程碑」改用共用 EmptyState 元件
    expect(w.text()).toContain('還沒有里程碑')
    expect(w.find('.carousel').exists()).toBe(false)
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

  it('shows toast when react fails (no longer silent)', async () => {
    // Why: 原本 catch{} 吞錯誤，家長以為點到實則沒寫入；應顯示錯誤
    toast.error.mockReset()
    fetchChildMilestones.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 9,
            title: '走第一步',
            achieved_on: '2026-05-01',
            icon: '👣',
            parent_reaction: null,
          },
        ],
      },
    })
    reactToMilestone.mockRejectedValueOnce({
      displayMessage: '網路錯誤',
    })
    const w = mount(MilestoneCarousel, { props: { studentId: 1 } })
    await flushPromises()
    const card = w.findComponent(MilestoneCard)
    expect(card.exists()).toBe(true)
    card.vm.$emit('react', 'like')
    await flushPromises()
    expect(reactToMilestone).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
    expect(toast.error.mock.calls[0][0]).toBe('網路錯誤')
  })
})
