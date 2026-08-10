// src/parent/components/__tests__/MilestoneAcknowledge.spec.ts
/**
 * 里程碑「我看到了」（acknowledge）。
 *
 * 後端端點與前端 api wrapper 都早就存在，但沒有任何 UI 入口
 * （2026-07-31 家長端體檢標為孤兒 API）。這裡補上入口與回歸測試。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const acknowledgeMock = vi.fn()
const fetchMock = vi.fn()
vi.mock('@/parent/api/childMilestones', () => ({
  fetchChildMilestones: (...a: unknown[]) => fetchMock(...a),
  reactToMilestone: vi.fn(),
  acknowledgeMilestone: (...a: unknown[]) => acknowledgeMock(...a),
  REACTION_EMOJI: { like: '👍', love: '🥰', celebrate: '🎉' },
}))

import MilestoneCard from '@/parent/components/MilestoneCard.vue'
import MilestoneCarousel from '@/parent/components/MilestoneCarousel.vue'

const baseMilestone = {
  id: 7,
  icon: '🎉',
  title: '會自己穿鞋子',
  achieved_on: '2026-08-05',
  description: '午睡起來自己把鞋子穿好',
  parent_reaction: null,
  parent_acknowledged_at: null,
}

beforeEach(() => {
  acknowledgeMock.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ data: { items: [{ ...baseMilestone }] } })
})

describe('MilestoneCard', () => {
  it('未確認時顯示「我看到了」按鈕', () => {
    const w = mount(MilestoneCard, { props: { milestone: { ...baseMilestone } } })
    expect(w.find('.ack-btn').exists()).toBe(true)
    expect(w.find('.acked').exists()).toBe(false)
    w.unmount()
  })

  it('已確認時改顯示灰勾，不再提供按鈕', () => {
    const w = mount(MilestoneCard, {
      props: {
        milestone: { ...baseMilestone, parent_acknowledged_at: '2026-08-06T10:00:00' },
      },
    })
    expect(w.find('.ack-btn').exists()).toBe(false)
    expect(w.find('.acked').text()).toContain('已確認')
    w.unmount()
  })

  it('點按鈕會 emit acknowledge', async () => {
    const w = mount(MilestoneCard, { props: { milestone: { ...baseMilestone } } })
    await w.find('.ack-btn').trigger('click')
    expect(w.emitted('acknowledge')).toBeTruthy()
    w.unmount()
  })

  it('日期格式化為中文，不直接吐 ISO 字串', () => {
    const w = mount(MilestoneCard, { props: { milestone: { ...baseMilestone } } })
    expect(w.find('.date').text()).toBe('2026 年 8 月 5 日')
    w.unmount()
  })

  it('emoji 反應鈕帶中文 aria-label（螢幕閱讀器讀得出來）', () => {
    const w = mount(MilestoneCard, { props: { milestone: { ...baseMilestone } } })
    const labels = w.findAll('.reaction').map((b) => b.attributes('aria-label'))
    expect(labels).toEqual(['按讚', '好喜歡', '恭喜'])
    w.unmount()
  })
})

describe('MilestoneCarousel', () => {
  it('確認成功後以回傳值更新該筆，按鈕轉為已確認', async () => {
    acknowledgeMock.mockResolvedValue({
      data: { ...baseMilestone, parent_acknowledged_at: '2026-08-10T09:00:00' },
    })

    const w = mount(MilestoneCarousel, { props: { studentId: 1 } })
    await flushPromises()

    expect(w.find('.ack-btn').exists()).toBe(true)
    await w.find('.ack-btn').trigger('click')
    await flushPromises()

    expect(acknowledgeMock).toHaveBeenCalledWith(1, 7)
    expect(w.find('.ack-btn').exists()).toBe(false)
    expect(w.find('.acked').exists()).toBe(true)
    w.unmount()
  })

  it('無里程碑時走 EmptyState，不是裸文字', async () => {
    fetchMock.mockResolvedValue({ data: { items: [] } })

    const w = mount(MilestoneCarousel, { props: { studentId: 1 } })
    await flushPromises()

    expect(w.text()).toContain('還沒有里程碑')
    expect(w.find('.carousel').exists()).toBe(false)
    w.unmount()
  })
})
