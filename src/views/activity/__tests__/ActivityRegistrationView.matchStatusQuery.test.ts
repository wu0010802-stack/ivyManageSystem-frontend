import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'

// 例外中心深連結（/activity/registrations?match_status=pending）需能在兩種情境下生效：
// ① 從別頁導覽過來（component 重新 mount，onMounted → initFromQuery 已覆蓋）
// ② 使用者已停留在本頁時再次點深連結（同路由僅換 query，Vue Router 不會重新 mount，
//    onMounted 不會再跑）——這是本檔要補的缺口，用 watch route.query.match_status 補上。

const mockRoute = reactive<{ query: Record<string, unknown> }>({ query: {} })
const routerReplace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn(), replace: routerReplace, back: vi.fn() }),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

const getRegistrations = vi.fn()

vi.mock('@/api/activity', () => ({
  getRegistrations: (...a: unknown[]) => getRegistrations(...a),
  getCourses: vi.fn().mockResolvedValue({ data: { courses: [] } }),
  getClassOptions: vi.fn().mockResolvedValue({ data: { options: [] } }),
  batchUpdatePayment: vi.fn(),
  getRegistrationDetail: vi.fn(),
  updateRemark: vi.fn(),
  promoteWaitlist: vi.fn(),
  deleteRegistration: vi.fn(),
  exportRegistrations: vi.fn(),
  getRegistrationPayments: vi.fn(),
  deleteRegistrationPayment: vi.fn(),
  withdrawCourse: vi.fn(),
  getRegistrationTime: vi.fn().mockResolvedValue({ data: {} }),
  removeRegistrationSupply: vi.fn(),
  // 審核工作流 API（useActivityReview 於 setup 匯入；本檔不觸發）
  matchRegistration: vi.fn(),
  rejectRegistration: vi.fn(),
  rematchRegistration: vi.fn(),
  forceAcceptRegistration: vi.fn(),
  restoreRegistration: vi.fn(),
  searchActivityStudents: vi.fn(),
}))

vi.mock('@/composables/useCountdownBanner', () => ({
  useCountdownBanner: () => ({ banner: { value: '' } }),
  countdownLabel: () => '',
}))

import ActivityRegistrationView from '../ActivityRegistrationView.vue'

function mountView() {
  return mount(ActivityRegistrationView, {
    shallow: true,
    global: {
      stubs: {
        AcademicTermSelector: true,
        'el-table': { template: '<div />' },
        'el-table-column': { template: '<div />' },
      },
    },
  })
}

describe('ActivityRegistrationView — route.query.match_status 綁定（例外中心深連結）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistrations.mockResolvedValue({ data: { items: [], total: 0 } })
    mockRoute.query = {}
  })

  it('初次掛載帶 ?match_status=pending → matchStatusFilter 初始化為 pending 並帶入查詢', async () => {
    mockRoute.query = { match_status: 'pending' }
    const wrapper = mountView()
    await nextTick()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { matchStatusFilter: string }
    expect(vm.matchStatusFilter).toBe('pending')
    expect(getRegistrations).toHaveBeenCalledWith(
      expect.objectContaining({ match_status: 'pending' }),
    )
  })

  it('已掛載後 route.query.match_status 改變（同路由深連結，component 不重新 mount）→ 重新綁定並重新查詢', async () => {
    const wrapper = mountView()
    await nextTick()
    await nextTick()
    await nextTick()
    getRegistrations.mockClear()

    // 模擬使用者已停留在本頁，此時點例外中心深連結（router-link 導到同路由換 query）
    mockRoute.query = { match_status: 'pending' }
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { matchStatusFilter: string; page: number }
    expect(vm.matchStatusFilter).toBe('pending')
    expect(vm.page).toBe(1)
    expect(getRegistrations).toHaveBeenCalledWith(
      expect.objectContaining({ match_status: 'pending' }),
    )
  })

  it('query 變回空（無 match_status）→ matchStatusFilter 清空並重新查詢', async () => {
    mockRoute.query = { match_status: 'pending' }
    const wrapper = mountView()
    await nextTick()
    await nextTick()
    await nextTick()
    getRegistrations.mockClear()

    mockRoute.query = {}
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { matchStatusFilter: string }
    expect(vm.matchStatusFilter).toBe('')
    expect(getRegistrations).toHaveBeenCalledWith(
      expect.objectContaining({ match_status: undefined }),
    )
  })
})
