import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useActivityStore } from '@/stores/activity'
import {
  getActivityAttendanceStats,
  getActivityStatsCharts,
  getActivityStatsSummary,
} from '@/api/activity'

vi.mock('@/api/activity', () => ({
  getActivityStats: vi.fn(),
  getActivityStatsSummary: vi.fn(),
  getActivityStatsCharts: vi.fn(),
  getActivityAttendanceStats: vi.fn(),
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
    expect(getActivityStatsSummary).toHaveBeenCalledWith({})
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
      attendance_stats: null,
    })
  })

  describe('學期感知（契約同 dashboard-table 的 school_year/semester）', () => {
    it('fetchSummary 帶學期參數時原樣傳給 API', async () => {
      getActivityStatsSummary.mockResolvedValue({ data: { totalRegistrations: 1 } })

      const store = useActivityStore()
      await store.fetchSummary({ school_year: 114, semester: 2 })

      expect(getActivityStatsSummary).toHaveBeenCalledWith({ school_year: 114, semester: 2 })
    })

    it('同學期 TTL 內第二次 fetchSummary 不重抓', async () => {
      getActivityStatsSummary.mockResolvedValue({ data: { totalRegistrations: 1 } })

      const store = useActivityStore()
      await store.fetchSummary({ school_year: 114, semester: 1 })
      await store.fetchSummary({ school_year: 114, semester: 1 })

      expect(getActivityStatsSummary).toHaveBeenCalledTimes(1)
    })

    it('切學期時即使 TTL 內也重抓（快取以學期 key 區分）', async () => {
      getActivityStatsSummary.mockResolvedValue({ data: { totalRegistrations: 1 } })
      getActivityStatsCharts.mockResolvedValue({ data: { daily: [] } })
      getActivityAttendanceStats.mockResolvedValue({ data: { total_sessions: 0 } })

      const store = useActivityStore()
      await store.fetchSummary({ school_year: 114, semester: 1 })
      await store.fetchSummary({ school_year: 114, semester: 2 })
      await store.fetchCharts({ school_year: 114, semester: 1 })
      await store.fetchCharts({ school_year: 114, semester: 2 })
      await store.fetchAttendanceStats({ school_year: 114, semester: 1 })
      await store.fetchAttendanceStats({ school_year: 114, semester: 2 })

      expect(getActivityStatsSummary).toHaveBeenCalledTimes(2)
      expect(getActivityStatsSummary).toHaveBeenLastCalledWith({ school_year: 114, semester: 2 })
      expect(getActivityStatsCharts).toHaveBeenCalledTimes(2)
      expect(getActivityStatsCharts).toHaveBeenLastCalledWith({ school_year: 114, semester: 2 })
      expect(getActivityAttendanceStats).toHaveBeenCalledTimes(2)
      expect(getActivityAttendanceStats).toHaveBeenLastCalledWith({ school_year: 114, semester: 2 })
    })

    it('fetchAttendanceStats 寫入 stats.attendance_stats', async () => {
      getActivityAttendanceStats.mockResolvedValue({
        data: { total_sessions: 5, avg_attendance_rate: 0.9, by_course: [] },
      })

      const store = useActivityStore()
      await store.fetchAttendanceStats({ school_year: 114, semester: 1 })

      expect(store.stats.attendance_stats).toEqual({
        total_sessions: 5,
        avg_attendance_rate: 0.9,
        by_course: [],
      })
    })

    it('fetchAttendanceStats 失敗時不擋（回傳既有值並記 error）', async () => {
      getActivityAttendanceStats.mockRejectedValue(new Error('boom'))

      const store = useActivityStore()
      const result = await store.fetchAttendanceStats({ school_year: 114, semester: 1 })

      expect(result).toBe(null)
      expect(store.stats.attendance_stats).toBe(null)
      expect(store.error).toBe('boom')
    })
  })
})
