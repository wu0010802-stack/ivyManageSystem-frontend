import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// ── API mocks ──────────────────────────────────────────────────────────────
vi.mock('@/api/activity', () => ({
  getRegistrations: vi.fn(),
  getRegistrationDetail: vi.fn(),
  batchUpdatePayment: vi.fn(),
  getCourses: vi.fn(),
  getClassOptions: vi.fn(),
  updatePayment: vi.fn(),
  updateRemark: vi.fn(),
  promoteWaitlist: vi.fn(),
  deleteRegistration: vi.fn(),
  exportRegistrations: vi.fn(),
  getRegistrationPayments: vi.fn(),
  addRegistrationPayment: vi.fn(),
  deleteRegistrationPayment: vi.fn(),
  withdrawCourse: vi.fn(),
}))

// ── constants mock ─────────────────────────────────────────────────────────
vi.mock('@/constants/activity', () => ({
  PAYMENT_STATUS_TAG_TYPE: { paid: 'success', partial: 'warning', overpaid: 'danger', unpaid: 'info' },
  PAYMENT_STATUS_LABEL: { paid: '已繳費', partial: '部分繳費', overpaid: '超繳', unpaid: '未繳費' },
}))

// ── composable mock ────────────────────────────────────────────────────────
const mockFetchList = vi.fn()
const mockLoadOptions = vi.fn()
const mockHandleSearch = vi.fn()
const mockHandleBatchMarkPaid = vi.fn()
const mockInitFromQuery = vi.fn()
const mockBatchMarkPaid = vi.fn()

const mockSelectedIds = ref([])
const mockList = ref([])
const mockTotal = ref(0)
const mockPage = ref(1)
const mockPageSize = ref(20)
const mockLoading = ref(false)
const mockSavingBatch = ref(false)
const mockSearchText = ref('')
const mockPaymentFilter = ref('')
const mockCourseFilter = ref(null)
const mockClassroomFilter = ref('')
const mockCourseOptions = ref([])
const mockClassroomOptions = ref([])

vi.mock('@/composables/useActivityRegistration', () => ({
  useActivityRegistration: () => ({
    list: mockList,
    total: mockTotal,
    page: mockPage,
    pageSize: mockPageSize,
    loading: mockLoading,
    searchText: mockSearchText,
    paymentFilter: mockPaymentFilter,
    courseFilter: mockCourseFilter,
    classroomFilter: mockClassroomFilter,
    courseOptions: mockCourseOptions,
    classroomOptions: mockClassroomOptions,
    selectedIds: mockSelectedIds,
    savingBatch: mockSavingBatch,
    initFromQuery: mockInitFromQuery,
    fetchList: mockFetchList,
    handleSearch: mockHandleSearch,
    batchMarkPaid: mockBatchMarkPaid,
    loadOptions: mockLoadOptions,
  }),
}))

// ── vue-router mock ────────────────────────────────────────────────────────
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

// ── element-plus mocks ─────────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// ── import View after mocks ────────────────────────────────────────────────
import ActivityRegistrationView from '@/views/activity/ActivityRegistrationView.vue'

// ── global stubs ───────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-table': { template: '<div><slot /></div>', methods: { clearSelection: vi.fn() } },
  'el-table-column': true,
  'el-pagination': true,
  'el-drawer': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input-number': { template: '<input />' },
  'el-date-picker': { template: '<input />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-skeleton': true,
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': true,
  'el-timeline': { template: '<div><slot /></div>' },
  'el-timeline-item': { template: '<div><slot /></div>' },
  'el-icon': { template: '<span />' },
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

function mountView() {
  return mount(ActivityRegistrationView, {
    global: {
      directives: { loading: () => {} },
      stubs: GLOBAL_STUBS,
    },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ActivityRegistrationView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectedIds.value = []
    mockList.value = []
    mockFetchList.mockResolvedValue(undefined)
    mockLoadOptions.mockResolvedValue(undefined)
    mockBatchMarkPaid.mockResolvedValue(undefined)
  })

  it('載入後呼叫 fetchList 和 loadOptions', async () => {
    mountView()
    await flushPromises()

    expect(mockFetchList).toHaveBeenCalledOnce()
    expect(mockLoadOptions).toHaveBeenCalledOnce()
  })

  it('selectedIds 有值時顯示批次工具列', async () => {
    mockSelectedIds.value = [1, 2]
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.batch-toolbar').exists()).toBe(true)
  })

  it('selectedIds 為空時不顯示批次工具列', async () => {
    mockSelectedIds.value = []
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.batch-toolbar').exists()).toBe(false)
  })

  it('點擊「標記已繳費」呼叫 batchMarkPaid(true, ...)', async () => {
    mockSelectedIds.value = [1, 2]
    const wrapper = mountView()
    await flushPromises()

    const btn = wrapper.find('.batch-toolbar button')
    await btn.trigger('click')
    await flushPromises()

    expect(mockBatchMarkPaid).toHaveBeenCalledWith(true, expect.any(Function))
  })
})
