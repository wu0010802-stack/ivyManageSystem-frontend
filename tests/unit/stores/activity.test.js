import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useActivityStore } from '@/stores/activity'
import { getActivityStatsCharts, getActivityStatsSummary } from '@/api/activity'

vi.mock('@/api/activity', () => ({
  getActivityStats: vi.fn(),
  getActivityStatsSummary: vi.fn(),
  getActivityStatsCharts: vi.fn(),
}))

describe('activity store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchSummary only requests summary endpoint and updates unread badge', async () => {
    getActivityStatsSummary.mockResolvedValue({
      data: {
        totalRegistrations: 10,
        unreadInquiries: 3,
      },
    })

    const store = useActivityStore()
    await store.fetchSummary()

    expect(getActivityStatsSummary).toHaveBeenCalledTimes(1)
    expect(getActivityStatsCharts).not.toHaveBeenCalled()
    expect(store.unreadInquiries).toBe(3)
    expect(store.summary).toEqual({
      totalRegistrations: 10,
      unreadInquiries: 3,
    })
  })

  it('fetchStats requests summary and charts in parallel', async () => {
    getActivityStatsSummary.mockResolvedValue({
      data: {
        totalRegistrations: 10,
        unreadInquiries: 1,
      },
    })
    getActivityStatsCharts.mockResolvedValue({
      data: {
        daily: [{ date: '2026-03-13', count: 2 }],
        topCourses: [{ name: '美術', count: 4 }],
      },
    })

    const store = useActivityStore()
    const stats = await store.fetchStats()

    expect(getActivityStatsSummary).toHaveBeenCalledTimes(1)
    expect(getActivityStatsCharts).toHaveBeenCalledTimes(1)
    expect(stats).toEqual({
      statistics: {
        totalRegistrations: 10,
        unreadInquiries: 1,
      },
      charts: {
        daily: [{ date: '2026-03-13', count: 2 }],
        topCourses: [{ name: '美術', count: 4 }],
      },
    })
  })
})
