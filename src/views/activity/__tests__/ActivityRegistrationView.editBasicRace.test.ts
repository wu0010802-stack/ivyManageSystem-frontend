import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// 稽核（2026-08-06）：編輯基本資料存檔後的詳情重載缺 drawerSeq 競態守衛。
// 同檔 handlePromote / onCourseAdded / onSupplyAdded 都會在 await 後比對 drawerSeq，
// 只有 onEditBasicSaved 沒有 → 承辦快速切換學生時，慢回應的 A 生詳情會蓋到已切成
// B 生的抽屜上（畫面顯示 B 的標題、A 的資料）。

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

const getRegistrationDetail = vi.fn()
const getRegistrationPayments = vi.fn()

vi.mock('@/api/activity', () => ({
  getRegistrationDetail: (...a: unknown[]) => getRegistrationDetail(...a),
  getRegistrationPayments: (...a: unknown[]) => getRegistrationPayments(...a),
  updateRemark: vi.fn(),
  promoteWaitlist: vi.fn(),
  exportRegistrations: vi.fn(),
  exportPaymentReport: vi.fn(),
  deleteRegistrationPayment: vi.fn(),
  withdrawCourse: vi.fn(),
  getRegistrationTime: vi.fn().mockResolvedValue({ data: { open_at: null, close_at: null } }),
  removeRegistrationSupply: vi.fn(),
  matchRegistration: vi.fn(),
  rejectRegistration: vi.fn(),
  rematchRegistration: vi.fn(),
  rematchAllPendingRegistrations: vi.fn(),
  forceAcceptRegistration: vi.fn(),
  restoreRegistration: vi.fn(),
  searchActivityStudents: vi.fn(),
  fetchMatchSuggestions: vi.fn(),
}))

const fetchList = vi.fn()

vi.mock('@/composables/useActivityRegistration', () => ({
  useActivityRegistration: () => ({
    list: ref([]),
    total: ref(0),
    page: ref(1),
    pageSize: ref(20),
    loading: ref(false),
    searchText: ref(''),
    paymentFilter: ref(''),
    matchStatusFilter: ref(''),
    courseFilter: ref(null),
    classroomFilter: ref(''),
    courseOptions: ref([]),
    classroomOptions: ref([]),
    savingBatch: ref(false),
    initFromQuery: vi.fn(),
    fetchList: (...a: unknown[]) => fetchList(...a),
    handleSearch: vi.fn(),
    batchMarkPaid: vi.fn(),
    loadOptions: vi.fn(),
  }),
}))

vi.mock('@/composables/useCountdownBanner', () => ({
  useCountdownBanner: () => ({ banner: ref(null) }),
  countdownLabel: () => '',
}))

import ActivityRegistrationView from '../ActivityRegistrationView.vue'

interface ViewVm {
  openDetail: (row: { id: number }) => Promise<void>
  onEditBasicSaved: () => Promise<void>
  detail: { id: number; student_name?: string } | null
}

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

const baseDetail = (id: number, name: string) => ({
  id,
  match_status: 'matched',
  student_name: name,
  total_amount: 0,
  courses: [],
  supplies: [],
  changes: [],
})

const emptyPayments = {
  data: { total_amount: 0, paid_amount: 0, payment_status: 'unpaid', records: [] },
}

describe('ActivityRegistrationView — 編輯基本資料存檔後的重載競態', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistrationPayments.mockResolvedValue(emptyPayments)
  })

  it('存檔重載期間承辦改看另一位學生 → 慢回應的舊詳情不得覆蓋抽屜', async () => {
    getRegistrationDetail.mockResolvedValue({ data: baseDetail(1, '甲生') })
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as unknown as ViewVm
    await vm.openDetail({ id: 1 })
    await flushPromises()
    expect(vm.detail?.id).toBe(1)

    // 甲生存檔後的重載卡住（後端慢回應）
    let releaseStale: () => void = () => {}
    getRegistrationDetail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseStale = () => resolve({ data: baseDetail(1, '甲生（改名後）') })
        }),
    )
    const saved = vm.onEditBasicSaved()

    // 承辦不等回應，直接改開乙生（drawerSeq++）
    getRegistrationDetail.mockResolvedValueOnce({ data: baseDetail(2, '乙生') })
    await vm.openDetail({ id: 2 })
    await flushPromises()
    expect(vm.detail?.id).toBe(2)

    // 舊請求這時才回來：必須被丟棄
    releaseStale()
    await saved
    await flushPromises()

    expect(vm.detail?.id).toBe(2)
    expect(vm.detail?.student_name).toBe('乙生')
  })

  it('抽屜未被切換時，存檔重載照常套用並刷新列表', async () => {
    getRegistrationDetail.mockResolvedValue({ data: baseDetail(1, '甲生') })
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as unknown as ViewVm
    await vm.openDetail({ id: 1 })
    await flushPromises()
    fetchList.mockClear()

    getRegistrationDetail.mockResolvedValueOnce({ data: baseDetail(1, '甲生（改名後）') })
    await vm.onEditBasicSaved()
    await flushPromises()

    expect(vm.detail?.student_name).toBe('甲生（改名後）')
    expect(fetchList).toHaveBeenCalled()
  })
})
