import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import HomeView from '@/views/HomeView.vue'

const push = vi.fn()
const intersectionObservers = []

class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback
    this.elements = []
    this.observe = vi.fn((element) => {
      this.elements.push(element)
    })
    this.unobserve = vi.fn()
    this.disconnect = vi.fn()
    intersectionObservers.push(this)
  }

  trigger(indexes) {
    const entries = indexes.map((index) => ({
      isIntersecting: true,
      target: this.elements[index],
    }))
    this.callback(entries, this)
  }
}

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

const getProbationAlerts = vi.fn(() => Promise.resolve({
  data: { employees: [], alerts: [] },
}))

vi.mock('@/api/home', () => ({
  getUpcomingEvents: (...args) => getUpcomingEvents(...args),
  getStudentAttendanceSummary: (...args) => getStudentAttendanceSummary(...args),
  getProbationAlerts: (...args) => getProbationAlerts(...args),
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
    'el-row': { template: '<div><slot /></div>' },
    'el-col': { template: '<div><slot /></div>' },
    'el-card': { template: '<div><slot /><slot name="header" /></div>' },
    'el-badge': true,
    'el-tag': true,
    'el-button': { template: '<button><slot /></button>' },
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
    vi.clearAllMocks()
    intersectionObservers.length = 0
    global.IntersectionObserver = MockIntersectionObserver
    window.IntersectionObserver = MockIntersectionObserver
  })

  afterEach(() => {
    delete global.IntersectionObserver
    delete window.IntersectionObserver
  })

  it('loads only critical cards on mount and defers secondary dashboard requests until sections enter viewport', async () => {
    shallowMount(HomeView, { global: globalConfig })

    await flushPromises()
    await nextTick()
    await flushPromises()

    expect(employeeStore.fetchEmployees).toHaveBeenCalledTimes(1)
    expect(getStudents).toHaveBeenCalledTimes(1)
    expect(getToday).toHaveBeenCalledTimes(1)
    expect(notificationStore.fetchSummary).toHaveBeenCalledTimes(1)

    expect(getStudentAttendanceSummary).not.toHaveBeenCalled()
    expect(getTodayAnomalies).not.toHaveBeenCalled()
    expect(getUpcomingEvents).not.toHaveBeenCalled()

    expect(intersectionObservers).toHaveLength(1)
    expect(intersectionObservers[0].observe).toHaveBeenCalledTimes(4)

    // section[0]: studentAttendance
    intersectionObservers[0].trigger([0])
    await flushPromises()
    expect(getStudentAttendanceSummary).toHaveBeenCalledTimes(1)
    expect(getTodayAnomalies).not.toHaveBeenCalled()

    // section[1]: anomalies
    intersectionObservers[0].trigger([1])
    await flushPromises()
    expect(getTodayAnomalies).toHaveBeenCalledTimes(1)
    expect(getUpcomingEvents).not.toHaveBeenCalled()

    // section[2]: calendar
    intersectionObservers[0].trigger([2])
    await flushPromises()
    expect(getUpcomingEvents).toHaveBeenCalledTimes(1)
    expect(getProbationAlerts).not.toHaveBeenCalled()

    // section[3]: probation
    intersectionObservers[0].trigger([3])
    await flushPromises()
    expect(getProbationAlerts).toHaveBeenCalledTimes(1)
  })

  it('mount 時不應出現未解析的 Element Plus icon 警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const {
      Calendar,
      User,
      Reading,
      UserFilled,
      More,
      Select,
      AlarmClock,
      Warning,
      EditPen,
      CircleCheck,
      Clock,
      TrendCharts,
      Setting,
      CircleCheckFilled,
      Location,
      ...stubsWithoutIcons
    } = globalConfig.stubs

    shallowMount(HomeView, {
      global: {
        ...globalConfig,
        stubs: stubsWithoutIcons,
      },
    })

    await flushPromises()
    await nextTick()
    await flushPromises()

    const warnings = warnSpy.mock.calls.flat().join('\n')
    expect(warnings).not.toContain('Failed to resolve component')

    warnSpy.mockRestore()
  })
})
