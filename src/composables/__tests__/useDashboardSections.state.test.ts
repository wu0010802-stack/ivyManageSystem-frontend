import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/students', () => ({ getStudents: vi.fn() }))
vi.mock('@/api/attendance', () => ({ getToday: vi.fn(), getTodayAnomalies: vi.fn() }))
vi.mock('@/api/home', () => ({
  getUpcomingEvents: vi.fn(),
  getStudentAttendanceSummary: vi.fn(),
  getProbationAlerts: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
  getUserInfo: vi.fn(() => ({ name: '測試員' })),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const fetchEmployeesMock = vi.fn()
const employeeStoreMock: { employees: unknown[]; fetchEmployees: typeof fetchEmployeesMock } = {
  employees: [],
  fetchEmployees: fetchEmployeesMock,
}
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => employeeStoreMock,
}))
vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => ({
    approvalSummary: {
      total: 0,
      pending_leaves: 0,
      pending_overtimes: 0,
      this_month_pending_leaves: 0,
      this_month_pending_overtimes: 0,
    },
    fetchSummary: vi.fn().mockResolvedValue(undefined),
  }),
}))

import { getStudents } from '@/api/students'
import { getToday, getTodayAnomalies } from '@/api/attendance'
import { getUpcomingEvents, getStudentAttendanceSummary } from '@/api/home'
import { useDashboardSections } from '@/composables/useDashboardSections'

// 假零修復（儀表板可信度）：API 失敗不得靜默渲染成 0，
// 必須以 per-source error state + null 值呈現「失敗長得像失敗」。
type SectionsApi = ReturnType<typeof useDashboardSections>

// 注意：setup 回傳巢狀物件不會自動 unwrap ref，改用模組變數直接持有
// composable 回傳值，斷言時明確取 .value。
let sections: SectionsApi

const Harness = defineComponent({
  setup() {
    sections = useDashboardSections()
    return () => h('div')
  },
})

function mountHarness() {
  return mount(Harness)
}

function mockHappyPath() {
  vi.mocked(getStudents).mockResolvedValue({ data: { total: 42 } } as never)
  vi.mocked(getToday).mockResolvedValue({ data: { total_employees: 10, present_count: 8, late_count: 1, missing_count: 1 } } as never)
  vi.mocked(getTodayAnomalies).mockResolvedValue({ data: { anomalies: [] } } as never)
  vi.mocked(getStudentAttendanceSummary).mockResolvedValue({ data: null } as never)
  vi.mocked(getUpcomingEvents).mockResolvedValue({ data: [] } as never)
  fetchEmployeesMock.mockResolvedValue(undefined)
}

describe('useDashboardSections 假零修復（per-source error state）', () => {
  beforeEach(() => {
    mockHappyPath()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('studentCount 初值為 null（非 0），成功後才是數字', async () => {
    // 永不 resolve 的 promise 模擬載入中
    vi.mocked(getStudents).mockReturnValue(new Promise(() => {}) as never)
    const wrapper = mountHarness()
    const s = sections
    expect(s.studentCount.value).toBe(null)
    wrapper.unmount()
  })

  it('getStudents 失敗時 studentCount 維持 null 且 criticalErrors.students = true', async () => {
    vi.mocked(getStudents).mockRejectedValue(new Error('500'))
    const wrapper = mountHarness()
    await flushPromises()
    const s = sections
    expect(s.studentCount.value).toBe(null)
    expect(s.criticalErrors.students).toBe(true)
    wrapper.unmount()
  })

  it('getToday 失敗時 criticalErrors.todayStats = true', async () => {
    vi.mocked(getToday).mockRejectedValue(new Error('500'))
    const wrapper = mountHarness()
    await flushPromises()
    const s = sections
    expect(s.todayStats.value).toBe(null)
    expect(s.criticalErrors.todayStats).toBe(true)
    wrapper.unmount()
  })

  it('fetchEmployees 失敗時 criticalErrors.employees = true', async () => {
    fetchEmployeesMock.mockRejectedValue(new Error('500'))
    const wrapper = mountHarness()
    await flushPromises()
    const s = sections
    expect(s.criticalErrors.employees).toBe(true)
    wrapper.unmount()
  })

  it('全部成功時 criticalErrors 全 false 且 studentCount 有值', async () => {
    const wrapper = mountHarness()
    await flushPromises()
    const s = sections
    expect(s.criticalErrors.students).toBe(false)
    expect(s.criticalErrors.todayStats).toBe(false)
    expect(s.criticalErrors.employees).toBe(false)
    expect(s.studentCount.value).toBe(42)
    wrapper.unmount()
  })

  it('anomalies 來源失敗時 deferredSections.anomalies.error = true（不得假裝全清空）', async () => {
    vi.mocked(getTodayAnomalies).mockRejectedValue(new Error('500'))
    const wrapper = mountHarness()
    await flushPromises()
    const s = sections
    expect(s.deferredSections.anomalies.error).toBe(true)
    wrapper.unmount()
  })

  it('retryTodoBoard 重設失敗來源並重抓成功', async () => {
    vi.mocked(getTodayAnomalies).mockRejectedValueOnce(new Error('500'))
    const wrapper = mountHarness()
    await flushPromises()
    const s = sections
    expect(s.deferredSections.anomalies.error).toBe(true)

    vi.mocked(getTodayAnomalies).mockResolvedValue({ data: { anomalies: [] } } as never)
    await s.retryTodoBoard()
    await flushPromises()
    expect(s.deferredSections.anomalies.error).toBe(false)
    expect(s.attendanceAnomalies.value).toEqual({ anomalies: [] })
    wrapper.unmount()
  })

  it('retryCritical 重抓成功後清除 error 並填回數值', async () => {
    vi.mocked(getStudents).mockRejectedValueOnce(new Error('500'))
    const wrapper = mountHarness()
    await flushPromises()
    const s = sections
    expect(s.criticalErrors.students).toBe(true)

    vi.mocked(getStudents).mockResolvedValue({ data: { total: 42 } } as never)
    await s.retryCritical()
    await flushPromises()
    expect(s.criticalErrors.students).toBe(false)
    expect(s.studentCount.value).toBe(42)
    wrapper.unmount()
  })
})

describe('useDashboardSections 資訊架構（行事曆 eager / probation 死碼移除）', () => {
  beforeEach(() => {
    mockHappyPath()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('行事曆改 eager：mount 後即抓 upcoming events（不等 IntersectionObserver）', async () => {
    const wrapper = mountHarness()
    await flushPromises()
    expect(getUpcomingEvents).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('probation 死碼已移除：deferredSections 不含 probation 且不打 API', async () => {
    const wrapper = mountHarness()
    await flushPromises()
    expect(Object.keys(sections.deferredSections)).not.toContain('probation')
    wrapper.unmount()
  })
})

describe('useDashboardSections 用詞與教師數推算', () => {
  beforeEach(() => {
    mockHappyPath()
    employeeStoreMock.employees = []
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('打卡異常用詞自解釋：整日未打卡 / 漏刷卡', async () => {
    const wrapper = mountHarness()
    expect(sections.anomalyLabel('absent', 0)).toBe('整日未打卡')
    expect(sections.anomalyLabel('missing_punch', 0)).toBe('漏刷卡')
    expect(sections.anomalyLabel('late', 12)).toBe('遲到 12 分')
    wrapper.unmount()
  })

  it('非官方職稱的自由字串不再被當成教師（舊「含師/導」推算已退場）', async () => {
    // 教師數改以 staff_role_category 判定、退路為官方職稱正面表列，
    // 完整規則見 useDashboardSections.schoolStats.test.ts。
    employeeStoreMock.employees = [
      { title: '老師' },
      { title: '廚師' },
      { position: '班導' },
      { title: '護理師' },
      { title: '營養師' },
      { title: '行政' },
    ]
    const wrapper = mountHarness()
    expect(sections.stats.value.teachers).toBe(0)
    expect(sections.stats.value.total).toBe(6)
    wrapper.unmount()
  })
})

describe('useDashboardSections 週末感知（isWeekend）', () => {
  beforeEach(() => {
    mockHappyPath()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('星期六 isWeekend = true', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-11T09:00:00'), toFake: ['Date'] })
    const wrapper = mountHarness()
    const s = sections
    expect(s.isWeekend.value).toBe(true)
    wrapper.unmount()
  })

  it('星期一 isWeekend = false', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-13T09:00:00'), toFake: ['Date'] })
    const wrapper = mountHarness()
    const s = sections
    expect(s.isWeekend.value).toBe(false)
    wrapper.unmount()
  })
})
