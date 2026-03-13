import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import HomeView from '@/views/HomeView.vue'

const push = vi.fn()

const employeeStore = {
  employees: [
    { id: 1, title: '主教', position: '教師' },
    { id: 2, title: '助教', position: '教師' },
    { id: 3, title: '行政', position: '行政' },
  ],
  fetchEmployees: vi.fn(() => Promise.resolve()),
}

const notificationStore = {
  approvalSummary: {
    pending_leaves: 1,
    pending_overtimes: 1,
    pending_punch_corrections: 0,
    total: 2,
    this_month_pending_leaves: 0,
    this_month_pending_overtimes: 0,
  },
  fetchSummary: vi.fn(() => Promise.resolve()),
}

const getStudents = vi.fn(() => Promise.resolve({ data: { total: 120 } }))
const getToday = vi.fn(() => Promise.resolve({
  data: {
    total_employees: 10,
    present_count: 8,
    late_count: 1,
    missing_count: 1,
  },
}))
const getTodayAnomalies = vi.fn(() => Promise.resolve({ data: { anomalies: [] } }))
const getUpcomingEvents = vi.fn(() => Promise.resolve({ data: [] }))
const getProbationAlerts = vi.fn(() => Promise.resolve({ data: { next_month: '2026-04', employees: [] } }))
const getStudentAttendanceSummary = vi.fn(() => Promise.resolve({
  data: {
    total_students: 120,
    recorded_count: 118,
    on_campus_count: 110,
    unmarked_count: 2,
    present_count: 108,
    late_count: 2,
    absent_count: 5,
    leave_count: 5,
    record_completion_rate: 98,
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => employeeStore,
}))

vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => notificationStore,
}))

vi.mock('@/api/students', () => ({
  getStudents: (...args) => getStudents(...args),
}))

vi.mock('@/api/attendance', () => ({
  getToday: (...args) => getToday(...args),
  getTodayAnomalies: (...args) => getTodayAnomalies(...args),
}))

vi.mock('@/api/home', () => ({
  getUpcomingEvents: (...args) => getUpcomingEvents(...args),
  getProbationAlerts: (...args) => getProbationAlerts(...args),
  getStudentAttendanceSummary: (...args) => getStudentAttendanceSummary(...args),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
  getUserInfo: vi.fn(() => ({ display_name: '測試管理員' })),
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const globalConfig = {
  directives: {
    loading: () => {},
  },
  stubs: {
    StatCard: true,
    'el-row': true,
    'el-col': true,
    'el-card': true,
    'el-badge': true,
    'el-tag': true,
    'el-button': true,
    'el-icon': true,
    'el-divider': true,
    Calendar: true,
    User: true,
    Reading: true,
    UserFilled: true,
    More: true,
    Select: true,
    AlarmClock: true,
    Warning: true,
    EditPen: true,
    CircleCheck: true,
    Clock: true,
    TrendCharts: true,
    Setting: true,
    CircleCheckFilled: true,
    Location: true,
  },
}

describe('HomeView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads only critical cards on mount and defers secondary dashboard requests', async () => {
    shallowMount(HomeView, { global: globalConfig })

    await flushPromises()

    expect(employeeStore.fetchEmployees).toHaveBeenCalledTimes(1)
    expect(getStudents).toHaveBeenCalledTimes(1)
    expect(getToday).toHaveBeenCalledTimes(1)
    expect(notificationStore.fetchSummary).toHaveBeenCalledTimes(1)

    expect(getStudentAttendanceSummary).not.toHaveBeenCalled()
    expect(getTodayAnomalies).not.toHaveBeenCalled()
    expect(getUpcomingEvents).not.toHaveBeenCalled()
    expect(getProbationAlerts).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(150)
    await flushPromises()
    expect(getStudentAttendanceSummary).toHaveBeenCalledTimes(1)
    expect(getTodayAnomalies).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(getTodayAnomalies).toHaveBeenCalledTimes(1)
    expect(getUpcomingEvents).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(getUpcomingEvents).toHaveBeenCalledTimes(1)
    expect(getProbationAlerts).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(getProbationAlerts).toHaveBeenCalledTimes(1)
  })
})
