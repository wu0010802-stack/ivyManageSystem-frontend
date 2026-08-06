import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 課程顯示順序（actcsort01）：後台拖拉決定公開報名頁與家長端的課程排列。
// 重點在「送出的必須是該學期完整清單」——後端對不完整的排列回 409，而搜尋
// 過濾後的 filteredCourses 只是子集，誤用會讓使用者每次排序都失敗。

const getCoursesMock = vi.hoisted(() => vi.fn())
const reorderCoursesMock = vi.hoisted(() => vi.fn())
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
  sweepExpiredWaitlist: vi.fn(),
  reorderCourses: reorderCoursesMock,
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
  ElMessageBox: { confirm: vi.fn() },
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
  'el-icon': { template: '<i><slot /></i>' },
  AcademicTermSelector: { template: '<div />' },
}

interface SortVm {
  openSortDialog: () => void
  handleSaveSort: () => Promise<void>
  sortDialogVisible: boolean
  sortSaving: boolean
  sortItems: { id: number; name: string }[]
  courseSearch: string
  filteredCourses: { id: number; name: string }[]
}

function setupState(wrapper: ReturnType<typeof mount>): SortVm {
  return (wrapper.vm.$ as unknown as { setupState: SortVm }).setupState
}

const COURSES = [
  { id: 1, name: '陶藝', price: 2400, capacity: 10, allow_waitlist: true },
  { id: 2, name: '圍棋', price: 1200, capacity: 20, allow_waitlist: true },
  { id: 3, name: '音樂律動', price: 1500, capacity: 15, allow_waitlist: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  getCoursesMock.mockResolvedValue({ data: { courses: COURSES } })
})

describe('ActivityCourseView 課程顯示順序', () => {
  it('儲存時送出拖拉後的完整 id 序列與當前學期', async () => {
    reorderCoursesMock.mockResolvedValue({ data: { message: '課程順序已儲存' } })
    const wrapper = mountView()
    await flushPromises()

    const vm = setupState(wrapper)
    vm.openSortDialog()
    // 模擬拖拉：把「音樂律動」拉到第一
    vm.sortItems = [COURSES[2], COURSES[0], COURSES[1]] as SortVm['sortItems']
    const callsBefore = getCoursesMock.mock.calls.length

    await vm.handleSaveSort()
    await flushPromises()

    expect(reorderCoursesMock).toHaveBeenCalledWith({
      school_year: 114,
      semester: 1,
      course_ids: [3, 1, 2],
    })
    expect(messageSuccessMock).toHaveBeenCalled()
    expect(setupState(wrapper).sortDialogVisible).toBe(false)
    // 順序已變 → 必須重載列表，否則畫面停在舊順序
    expect(getCoursesMock.mock.calls.length).toBe(callsBefore + 1)
  })

  it('搜尋過濾中開啟排序時仍以完整清單為底（避免送出子集被判 409）', async () => {
    const wrapper = mountView()
    await flushPromises()

    const vm = setupState(wrapper)
    vm.courseSearch = '圍棋'
    await flushPromises()
    // 先確認過濾真的生效，否則下面的斷言會是假綠
    expect(setupState(wrapper).filteredCourses.map((c) => c.id)).toEqual([2])

    vm.openSortDialog()

    expect(setupState(wrapper).sortItems.map((c) => c.id)).toEqual([1, 2, 3])
  })

  it('儲存失敗時顯示錯誤、重載清單且 sortSaving 復原', async () => {
    reorderCoursesMock.mockRejectedValue({
      response: { status: 409, data: { detail: '課程清單已變動，請重新整理後再排序' } },
    })
    const wrapper = mountView()
    await flushPromises()

    const vm = setupState(wrapper)
    vm.openSortDialog()
    const callsBefore = getCoursesMock.mock.calls.length

    await vm.handleSaveSort()
    await flushPromises()

    expect(messageErrorMock).toHaveBeenCalled()
    // 409＝前端清單已過期，必須重載才能重排
    expect(getCoursesMock.mock.calls.length).toBe(callsBefore + 1)
    expect(setupState(wrapper).sortSaving).toBe(false)
  })
})

function mountView() {
  return mount(ActivityCourseView, { global: { stubs: STUBS } })
}
