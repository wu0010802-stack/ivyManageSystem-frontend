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
    approvalSummary: { total: 0, pending_leaves: 0, pending_overtimes: 0, this_month_pending_leaves: 0, this_month_pending_overtimes: 0 },
    fetchSummary: vi.fn().mockResolvedValue(undefined),
  }),
}))

import { getStudents } from '@/api/students'
import { getToday, getTodayAnomalies } from '@/api/attendance'
import { getUpcomingEvents, getStudentAttendanceSummary } from '@/api/home'
import { useDashboardSections } from '@/composables/useDashboardSections'

// 「學校概況」三個數字的正確性回歸：
// 1. 全校在籍人數必須是「當期學期」的人數 —— 後端 /students 只在明確帶 school_year+semester
//    時才套學期過濾，前端漏帶就會拿到跨所有學年的全表 count（2026-07-31 於 staging 顯示 198，
//    實為 115-1 的 196 人 + 114-2 的 2 人）。
// 2. 教職員總數只算在職 —— /employees 不帶 is_active 會連離職員工一起回。
// 3. 教師人數以後端 staff_role_category（教保身分別）判定，不再用職稱字串猜。

type SectionsApi = ReturnType<typeof useDashboardSections>
let sections: SectionsApi

const Harness = defineComponent({
  setup() {
    sections = useDashboardSections()
    return () => h('div')
  },
})

function mockHappyPath() {
  vi.mocked(getStudents).mockResolvedValue({ data: { total: 42 } } as never)
  vi.mocked(getToday).mockResolvedValue({ data: { total_employees: 10, present_count: 8, late_count: 1, missing_count: 1 } } as never)
  vi.mocked(getTodayAnomalies).mockResolvedValue({ data: { anomalies: [] } } as never)
  vi.mocked(getStudentAttendanceSummary).mockResolvedValue({ data: null } as never)
  vi.mocked(getUpcomingEvents).mockResolvedValue({ data: [] } as never)
  fetchEmployeesMock.mockResolvedValue(undefined)
}

describe('學校概況：全校在籍人數依當期學期查詢', () => {
  beforeEach(() => {
    mockHappyPath()
    employeeStoreMock.employees = []
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('7/31 屬下學期：getStudents 帶 school_year=114 semester=2', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-31T20:00:00'), toFake: ['Date'] })
    const wrapper = mount(Harness)
    await flushPromises()
    expect(getStudents).toHaveBeenCalledWith(
      expect.objectContaining({ school_year: 114, semester: 2 }),
    )
    wrapper.unmount()
  })

  it('8/1 跨到上學期：getStudents 帶 school_year=115 semester=1', async () => {
    vi.useFakeTimers({ now: new Date('2026-08-01T09:00:00'), toFake: ['Date'] })
    const wrapper = mount(Harness)
    await flushPromises()
    expect(getStudents).toHaveBeenCalledWith(
      expect.objectContaining({ school_year: 115, semester: 1 }),
    )
    wrapper.unmount()
  })

  it('retryCritical 重抓時同樣帶當期學期（不得退回無過濾的全表 count）', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-31T20:00:00'), toFake: ['Date'] })
    const wrapper = mount(Harness)
    await flushPromises()
    vi.mocked(getStudents).mockClear()

    await sections.retryCritical()
    await flushPromises()
    expect(getStudents).toHaveBeenCalledWith(
      expect.objectContaining({ school_year: 114, semester: 2 }),
    )
    wrapper.unmount()
  })
})

describe('學校概況：教職員總數與教師人數', () => {
  beforeEach(() => {
    mockHappyPath()
    employeeStoreMock.employees = []
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('教職員總數排除離職員工', async () => {
    employeeStoreMock.employees = [
      { is_active: true, staff_role_category: 'educare_certified' },
      { is_active: true, staff_role_category: 'office' },
      { is_active: false, staff_role_category: 'educare_certified' },
      { is_active: false, staff_role_category: 'kitchen' },
    ]
    const wrapper = mount(Harness)
    expect(sections.stats.value.total).toBe(2)
    wrapper.unmount()
  })

  it('教師人數以 staff_role_category 判定教保服務人員，離職者不計', async () => {
    employeeStoreMock.employees = [
      { is_active: true, staff_role_category: 'teacher_certified' },
      { is_active: true, staff_role_category: 'educare_certified' },
      { is_active: true, staff_role_category: 'assistant_educare' },
      { is_active: true, staff_role_category: 'office' },
      { is_active: true, staff_role_category: 'kitchen' },
      { is_active: true, staff_role_category: 'driver' },
      { is_active: true, staff_role_category: 'other' },
      { is_active: false, staff_role_category: 'teacher_certified' },
    ]
    const wrapper = mount(Harness)
    expect(sections.stats.value.total).toBe(7)
    expect(sections.stats.value.teachers).toBe(3)
    expect(sections.stats.value.others).toBe(4)
    wrapper.unmount()
  })

  it('staff_role_category 未填時退回職稱判定，且不把廚師/護理師算成教師', async () => {
    employeeStoreMock.employees = [
      { is_active: true, title: '幼兒園教師' },
      { is_active: true, title: '教保員' },
      { is_active: true, title: '助理教保員' },
      { is_active: true, title: '廚師' },
      { is_active: true, title: '護理師' },
      { is_active: true, title: '職員' },
    ]
    const wrapper = mount(Harness)
    expect(sections.stats.value.teachers).toBe(3)
    wrapper.unmount()
  })
})
