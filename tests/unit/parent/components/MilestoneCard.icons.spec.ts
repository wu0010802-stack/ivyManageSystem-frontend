import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/parent/api/childMilestones', () => ({
  fetchChildMilestones: vi.fn(),
  reactToMilestone: vi.fn(),
  acknowledgeMilestone: vi.fn(),
  REACTION_EMOJI: { like: '👍', love: '🥰', celebrate: '🎉' },
}))

import MilestoneCard from '@/parent/components/MilestoneCard.vue'

const base = {
  id: 7,
  milestone_type: 'birthday',
  icon: '🎂',
  title: '四歲生日',
  achieved_on: '2026-03-12',
  description: '',
  parent_reaction: null,
  parent_acknowledged_at: null,
}

function mountCard(over: Record<string, unknown> = {}) {
  return mount(MilestoneCard, { props: { milestone: { ...base, ...over } } })
}

describe('MilestoneCard — 依 milestone_type 對 Material 圖示', () => {
  it('birthday → cake，coral 卡片', () => {
    const w = mountCard()
    expect(w.find('.icon .material-symbols-rounded').text()).toBe('cake')
    expect(w.find('.milestone-card').classes()).toContain('tone-coral')
  })

  it('activity_first_join → celebration，sun 卡片', () => {
    const w = mountCard({ milestone_type: 'activity_first_join', icon: '🎉' })
    expect(w.find('.icon .material-symbols-rounded').text()).toBe('celebration')
    expect(w.find('.milestone-card').classes()).toContain('tone-sun')
  })

  it('graduation → school，grape 卡片', () => {
    const w = mountCard({ milestone_type: 'graduation', icon: '🎓' })
    expect(w.find('.icon .material-symbols-rounded').text()).toBe('school')
    expect(w.find('.milestone-card').classes()).toContain('tone-grape')
  })

  it('已知類型不受後端 emoji 影響（emoji 不上畫面）', () => {
    const w = mountCard({ icon: '🏆' })
    expect(w.find('.icon .material-symbols-rounded').text()).toBe('cake')
    expect(w.text()).not.toContain('🏆')
  })

  it('custom 類型保留老師選的 emoji，放在同一個方塊裡', () => {
    const w = mountCard({ milestone_type: 'custom', icon: '🎵' })
    expect(w.find('.icon').text()).toBe('🎵')
    expect(w.find('.icon .material-symbols-rounded').exists()).toBe(false)
    expect(w.find('.milestone-card').classes()).toContain('tone-sky')
  })

  it('未知類型且無 emoji → ✨ fallback', () => {
    const w = mountCard({ milestone_type: 'brand_new_type', icon: null })
    expect(w.find('.icon').text()).toBe('✨')
  })
})
