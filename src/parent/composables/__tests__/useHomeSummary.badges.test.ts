/**
 * useHomeSummary 徽章加總（2026-09-02）。
 *
 * pending_survey_count 原本沒有併入 HomeBadges，事務頁自己 cast summary 讀，
 * 導致頁面顯示「活動調查 4」但底部 tab 徽章不算它——同一件事兩個數字。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const dataRef = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: () => ({
    data: dataRef,
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))
vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))

import { useHomeSummary } from '@/parent/composables/useHomeSummary'

beforeEach(() => {
  dataRef.value = null
})

describe('useHomeSummary', () => {
  it('badges 帶出 pendingSurveyCount', () => {
    dataRef.value = { summary: { pending_survey_count: 3 } }
    const { badges } = useHomeSummary()
    expect(badges.value.pendingSurveyCount).toBe(3)
  })

  it('adminTabBadge 加計活動調查，但不計資訊性的近期請假審核（與首頁待辦件數一致）', () => {
    dataRef.value = {
      summary: {
        fees: { outstanding_count: 1, overdue: 0 },
        pending_event_acks: 1,
        pending_activity_promotions: 1,
        recent_leave_reviews: 1,
        pending_survey_count: 2,
      },
    }
    const { adminTabBadge } = useHomeSummary()
    expect(adminTabBadge.value).toBe(5)
  })

  it('不再提供聯絡簿 tab 徽章（原本是未讀公告數，聯絡簿頁已無公告分頁，紅點找不到來源）', () => {
    dataRef.value = { summary: { unread_announcements: 3 } }
    const result = useHomeSummary() as Record<string, unknown>
    expect(result.contactBookTabBadge).toBeUndefined()
  })

  it('欄位缺漏時 pendingSurveyCount 為 0', () => {
    dataRef.value = { summary: {} }
    const { badges } = useHomeSummary()
    expect(badges.value.pendingSurveyCount).toBe(0)
  })
})
