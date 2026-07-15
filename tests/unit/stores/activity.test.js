import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useActivityStore } from '@/stores/activity'
import {
  getActivityStats,
  getActivityStatsCharts,
  getActivityStatsSummary,
  getActivityDashboardTable,
} from '@/api/activity'

vi.mock('@/api/activity', () => ({
  getActivityStats: vi.fn(),
  getActivityStatsSummary: vi.fn(),
  getActivityStatsCharts: vi.fn(),
  getActivityDashboardTable: vi.fn(),
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
      getActivityStats.mockResolvedValue({ data: { attendance_stats: { total_sessions: 0 } } })

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
      expect(getActivityStats).toHaveBeenCalledTimes(2)
      expect(getActivityStats).toHaveBeenLastCalledWith({ school_year: 114, semester: 2 })
    })

    it('fetchAttendanceStats 呼叫 /activity/stats 聚合並只取 attendance_stats key', async () => {
      getActivityStats.mockResolvedValue({
        data: {
          statistics: { totalRegistrations: 10 },
          charts: { daily: [] },
          attendance_stats: { total_sessions: 5, avg_attendance_rate: 0.9, by_course: [] },
        },
      })

      const store = useActivityStore()
      await store.fetchAttendanceStats({ school_year: 114, semester: 1 })

      expect(getActivityStats).toHaveBeenCalledWith({ school_year: 114, semester: 1 })
      expect(store.stats.attendance_stats).toEqual({
        total_sessions: 5,
        avg_attendance_rate: 0.9,
        by_course: [],
      })
      // 聚合回應的 statistics/charts 不污染 summary/charts 快取（各 action 自己抓）
      expect(store.summary).toBe(null)
      expect(store.charts).toBe(null)
    })

    it('fetchAttendanceStats 失敗時不擋（回傳既有值並記 error）', async () => {
      getActivityStats.mockRejectedValue(new Error('boom'))

      const store = useActivityStore()
      const result = await store.fetchAttendanceStats({ school_year: 114, semester: 1 })

      expect(result).toBe(null)
      expect(store.stats.attendance_stats).toBe(null)
      expect(store.error).toBe('boom')
    })

    it('fetchDashboardTable 呼叫 dashboard-table、學期感知 TTL 內不重抓', async () => {
      getActivityDashboardTable.mockResolvedValue({ data: { grades: [], courses: [], grand_total: {} } })

      const store = useActivityStore()
      await store.fetchDashboardTable({ school_year: 114, semester: 1 })
      await store.fetchDashboardTable({ school_year: 114, semester: 1 }) // TTL 內

      expect(getActivityDashboardTable).toHaveBeenCalledTimes(1)
      expect(getActivityDashboardTable).toHaveBeenCalledWith({ school_year: 114, semester: 1 })
      expect(store.dashboardTable).toEqual({ grades: [], courses: [], grand_total: {} })
    })

    it('fetchDashboardTable 切學期重抓（快取以學期 key 區分）', async () => {
      getActivityDashboardTable.mockResolvedValue({ data: { grades: [], courses: [], grand_total: {} } })

      const store = useActivityStore()
      await store.fetchDashboardTable({ school_year: 114, semester: 1 })
      await store.fetchDashboardTable({ school_year: 114, semester: 2 })

      expect(getActivityDashboardTable).toHaveBeenCalledTimes(2)
      expect(getActivityDashboardTable).toHaveBeenLastCalledWith({ school_year: 114, semester: 2 })
    })

    it('fetchDashboardTable force 強制重抓（忽略 TTL）', async () => {
      getActivityDashboardTable.mockResolvedValue({ data: { grades: [], courses: [], grand_total: {} } })

      const store = useActivityStore()
      await store.fetchDashboardTable({ school_year: 114, semester: 1 })
      await store.fetchDashboardTable({ force: true, school_year: 114, semester: 1 })

      expect(getActivityDashboardTable).toHaveBeenCalledTimes(2)
    })

    it('fetchDashboardTable inflight dedupe：同學期並行只打一次', async () => {
      let resolveFn
      getActivityDashboardTable.mockReturnValue(new Promise((r) => { resolveFn = r }))

      const store = useActivityStore()
      const p1 = store.fetchDashboardTable({ school_year: 114, semester: 1 })
      const p2 = store.fetchDashboardTable({ school_year: 114, semester: 1 })
      resolveFn({ data: { grades: [], courses: [], grand_total: {} } })
      await Promise.all([p1, p2])

      expect(getActivityDashboardTable).toHaveBeenCalledTimes(1)
    })

    it('fetchDashboardTable 競態：舊學期晚到不覆寫新學期', async () => {
      const deferred = () => {
        let resolve
        const promise = new Promise((r) => { resolve = r })
        return { promise, resolve }
      }
      const oldTerm = deferred()
      const newTerm = deferred()
      getActivityDashboardTable
        .mockImplementationOnce(() => oldTerm.promise)
        .mockImplementationOnce(() => newTerm.promise)

      const store = useActivityStore()
      const p1 = store.fetchDashboardTable({ school_year: 114, semester: 1 })
      const p2 = store.fetchDashboardTable({ school_year: 114, semester: 2 })

      newTerm.resolve({ data: { grades: [], courses: [{ id: 9, name: '新' }], grand_total: {} } })
      await p2
      oldTerm.resolve({ data: { grades: [], courses: [{ id: 1, name: '舊' }], grand_total: {} } })
      await p1

      expect(store.dashboardTable.courses).toEqual([{ id: 9, name: '新' }])
      expect(store.dashboardTableTermKey).toBe('114-2')
      expect(store.loadingDashboardTable).toBe(false)
    })

    it('競態：舊學期晚到的回應不覆寫新學期的快取與狀態', async () => {
      const deferred = () => {
        let resolve
        const promise = new Promise((r) => { resolve = r })
        return { promise, resolve }
      }
      const oldTerm = deferred()
      const newTerm = deferred()
      getActivityStats
        .mockImplementationOnce(() => oldTerm.promise)
        .mockImplementationOnce(() => newTerm.promise)

      const store = useActivityStore()
      const p1 = store.fetchAttendanceStats({ school_year: 114, semester: 1 })
      const p2 = store.fetchAttendanceStats({ school_year: 114, semester: 2 })

      // 新學期先回並 commit
      newTerm.resolve({
        data: { attendance_stats: { total_sessions: 9, avg_attendance_rate: 0.9, by_course: [] } },
      })
      await p2

      // 舊學期晚到：不可覆寫新學期資料 / termKey / loading
      oldTerm.resolve({
        data: { attendance_stats: { total_sessions: 1, avg_attendance_rate: 0.1, by_course: [] } },
      })
      await p1

      expect(store.attendance).toEqual({
        total_sessions: 9,
        avg_attendance_rate: 0.9,
        by_course: [],
      })
      expect(store.attendanceTermKey).toBe('114-2')
      expect(store.loadingAttendance).toBe(false)
    })

    it.each([
      ['summary', 'fetchSummary', getActivityStatsSummary, 'summary', 'summaryTermKey', (name) => ({ totalRegistrations: name })],
      ['charts', 'fetchCharts', getActivityStatsCharts, 'charts', 'chartsTermKey', (name) => ({ label: name })],
      ['attendance', 'fetchAttendanceStats', getActivityStats, 'attendance', 'attendanceTermKey', (name) => ({ attendance_stats: { label: name } })],
      ['dashboard table', 'fetchDashboardTable', getActivityDashboardTable, 'dashboardTable', 'dashboardTableTermKey', (name) => ({ courses: [{ name }] })],
    ])('A 已快取、B pending、再選 A cache hit：B 晚回不得覆寫 %s', async (_label, action, apiMock, stateKey, termKey, body) => {
      const store = useActivityStore()
      apiMock.mockResolvedValueOnce({ data: body('A') })
      await store[action]({ school_year: 114, semester: 1 })

      let resolveB
      apiMock.mockReturnValueOnce(new Promise((resolve) => { resolveB = resolve }))
      const pendingB = store[action]({ school_year: 114, semester: 2 })

      // A 仍在 TTL，這次不打 API；但它必須成為最新的畫面目標。
      await store[action]({ school_year: 114, semester: 1 })
      resolveB({ data: body('B') })
      await pendingB

      const actual = stateKey === 'attendance'
        ? store[stateKey]?.label
        : stateKey === 'dashboardTable'
          ? store[stateKey]?.courses?.[0]?.name
          : stateKey === 'summary'
            ? store[stateKey]?.totalRegistrations
            : store[stateKey]?.label
      expect(actual).toBe('A')
      expect(store[termKey]).toBe('114-1')
    })
  })
})
