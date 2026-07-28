import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 2026-07-27 審查發現：候補過期回收在 production 三路皆斷（排程旗標未設、
// sweepExpiredWaitlist API 為死碼無 UI 入口、通知信關閉），逾期 promoted_pending
// 永久佔容量。本測驗證課程管理頁新增的「掃描過期候補」按鈕：確認後呼叫 API、
// 顯示計數並重載課程；取消不呼叫；失敗顯示錯誤且 loading 復原。

const getCoursesMock = vi.hoisted(() => vi.fn())
const sweepExpiredWaitlistMock = vi.hoisted(() => vi.fn())
const confirmMock = vi.hoisted(() => vi.fn())
const messageSuccessMock = vi.hoisted(() => vi.fn())
const messageErrorMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  getCourses: getCoursesMock,
  getCourseWaitlist: vi.fn(),
  getCourseEnrolled: vi.fn(),
  promoteWaitlist: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deleteCourse: vi.fn(),
  copyCoursesFromPrevious: vi.fn(),
  sweepExpiredWaitlist: sweepExpiredWaitlistMock,
}))
vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn().mockResolvedValue({ data: [] }),
}))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('element-plus', () => ({
  ElMessage: { success: messageSuccessMock, error: messageErrorMock, warning: vi.fn() },
  ElMessageBox: { confirm: confirmMock },
}))

import ActivityCourseView from '../ActivityCourseView.vue'

const STUBS = {
  'el-drawer': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-button': { template: '<button><slot /></button>' },
  'el-empty': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-switch': { template: '<div />' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': { template: '<input />' },
  'el-input-number': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-time-picker': { template: '<input />' },
  'el-alert': { template: '<div><slot /></div>' },
  AcademicTermSelector: { template: '<div />' },
}

type SweepVm = {
  handleSweepExpired: () => Promise<void>
  sweeping: boolean
}

function setupState(wrapper: ReturnType<typeof mount>): SweepVm {
  return (wrapper.vm.$ as unknown as { setupState: SweepVm }).setupState
}

function mountView() {
  return mount(ActivityCourseView, { global: { stubs: STUBS } })
}

beforeEach(() => {
  vi.clearAllMocks()
  getCoursesMock.mockResolvedValue({ data: { courses: [] } })
})

describe('ActivityCourseView 掃描過期候補', () => {
  it('確認後呼叫 sweep API、顯示計數訊息並重載課程', async () => {
    confirmMock.mockResolvedValue('confirm')
    sweepExpiredWaitlistMock.mockResolvedValue({
      data: { message: '候補過期掃描完成', expired: 2, reminded: 1, final_reminded: 1 },
    })
    const wrapper = mountView()
    await flushPromises()
    const callsBefore = getCoursesMock.mock.calls.length

    await setupState(wrapper).handleSweepExpired()
    await flushPromises()

    expect(sweepExpiredWaitlistMock).toHaveBeenCalledTimes(1)
    expect(messageSuccessMock).toHaveBeenCalledWith(expect.stringContaining('逾期釋出 2 筆'))
    expect(messageSuccessMock).toHaveBeenCalledWith(expect.stringContaining('提醒 2 筆'))
    // 掃描會改變 waitlist_count / 佔位數 → 必須重載課程列表
    expect(getCoursesMock.mock.calls.length).toBe(callsBefore + 1)
  })

  it('取消確認框時不呼叫 API', async () => {
    confirmMock.mockRejectedValue('cancel')
    const wrapper = mountView()
    await flushPromises()

    await setupState(wrapper).handleSweepExpired()

    expect(sweepExpiredWaitlistMock).not.toHaveBeenCalled()
  })

  it('API 失敗時顯示錯誤且 sweeping 復原為 false', async () => {
    confirmMock.mockResolvedValue('confirm')
    sweepExpiredWaitlistMock.mockRejectedValue({
      response: { data: { detail: '請稍後再試' } },
    })
    const wrapper = mountView()
    await flushPromises()

    await setupState(wrapper).handleSweepExpired()
    await flushPromises()

    expect(messageErrorMock).toHaveBeenCalled()
    expect(setupState(wrapper).sweeping).toBe(false)
  })
})
