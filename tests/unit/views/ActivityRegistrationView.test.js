import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'

// RegistrationTimeline 在 view 內以 defineAsyncComponent 動態 import；不 mock 掉，其
// scoped-style CSS import 會在測試環境 teardown 後才 resolve → EnvironmentTeardownError
// （flaky，讓 vitest exit 非 0、CI 紅）。純展示子元件，mock 為空 render 不影響本 view 斷言。
vi.mock('@/components/activity/RegistrationTimeline.vue', () => ({
  default: { name: 'RegistrationTimeline', render: () => null },
}))

// 同理，RegistrationPaymentDialog 亦為 defineAsyncComponent，被「開繳費對話框」測試
// 觸發載入；其 module import 的 POS_ORG_INFO 常數在測試 teardown 後才 resolve 會炸
// EnvironmentTeardownError（flaky、CI 紅）。純展示子元件，mock 為空 render。
vi.mock('@/components/activity/RegistrationPaymentDialog.vue', () => ({
  default: { name: 'RegistrationPaymentDialog', render: () => null },
}))

// ── API mocks ──────────────────────────────────────────────────────────────
vi.mock('@/api/activity', () => ({
  getRegistrations: vi.fn(),
  getRegistrationDetail: vi.fn(),
  batchUpdatePayment: vi.fn(),
  getCourses: vi.fn(),
  getSupplies: vi.fn().mockResolvedValue({ data: { supplies: [] } }),
  getClassOptions: vi.fn(),
  updatePayment: vi.fn(),
  updateRemark: vi.fn(),
  promoteWaitlist: vi.fn(),
  deleteRegistration: vi.fn(),
  exportRegistrations: vi.fn(),
  exportPaymentReport: vi.fn(),
  getRegistrationPayments: vi.fn(),
  addRegistrationPayment: vi.fn(),
  deleteRegistrationPayment: vi.fn(),
  withdrawCourse: vi.fn(),
  getRegistrationTime: vi.fn().mockResolvedValue({ data: { open_at: null, close_at: null } }),
  createRegistration: vi.fn(),
  updateRegistrationBasic: vi.fn(),
  addRegistrationCourse: vi.fn(),
  addRegistrationSupply: vi.fn(),
  removeRegistrationSupply: vi.fn(),
  // 審核工作流 API（useActivityReview 於 setup 匯入；本檔測試不觸發，僅需存在）
  matchRegistration: vi.fn(),
  rejectRegistration: vi.fn(),
  rematchRegistration: vi.fn(),
  forceAcceptRegistration: vi.fn(),
  restoreRegistration: vi.fn(),
  searchActivityStudents: vi.fn(),
}))

// ── Pinia store mock ───────────────────────────────────────────────────────
// 用 reactive()（非每次呼叫都回傳新字面值物件）：view 內對
// termStore.school_year/semester 的 watch 需要真正的響應性才能在測試中被觸發
// （資安 #3 2026-07-30：切換學期清空 selectedRows 的回歸測試）。
const mockTermStore = reactive({
  school_year: 114,
  semester: 1,
  setTerm(sy, sem) {
    mockTermStore.school_year = sy
    mockTermStore.semester = sem
  },
})
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => mockTermStore,
}))

// ── auth util mock（hasPermission 固定回傳 true）─────────────────────────────
vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

// ── format util mock ───────────────────────────────────────────────────────
vi.mock('@/utils/format', () => ({
  formatActivityDate: (v) => v || '',
}))

// ── countdown banner composable mock ───────────────────────────────────────
vi.mock('@/composables/useCountdownBanner', () => ({
  useCountdownBanner: () => ({ banner: ref(null), countdownLabel: () => '', formatIsoMinute: (v) => v || '' }),
  countdownLabel: () => '',
  formatIsoMinute: (v) => v || '',
}))

// ── constants mock ─────────────────────────────────────────────────────────
vi.mock('@/constants/activity', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    PAYMENT_STATUS_TAG_TYPE: { paid: 'success', partial: 'warning', overpaid: 'danger', unpaid: 'info' },
    PAYMENT_STATUS_LABEL: { paid: '已繳費', partial: '部分繳費', overpaid: '超繳', unpaid: '未繳費' },
    COURSE_STATUS_TAG_TYPE: { enrolled: 'success', waitlist: 'warning' },
    COURSE_STATUS_LABEL: { enrolled: '正式', waitlist: '候補' },
  }
})

// ── composable mock ────────────────────────────────────────────────────────
const mockFetchList = vi.fn()
const mockLoadOptions = vi.fn()
const mockHandleSearch = vi.fn()
const mockHandleBatchMarkPaid = vi.fn()
const mockInitFromQuery = vi.fn()
const mockBatchMarkPaid = vi.fn()

const mockMatchStatusFilter = ref('')
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
    matchStatusFilter: mockMatchStatusFilter,
    courseFilter: mockCourseFilter,
    classroomFilter: mockClassroomFilter,
    courseOptions: mockCourseOptions,
    classroomOptions: mockClassroomOptions,
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
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// ── download util mock ──────────────────────────────────────────────────────
// 匯出改走共用 saveBlobResponse（吃後端 Content-Disposition 中文檔名），
// 測試不再 spy URL.createObjectURL / <a>.click 的手刻下載流程。
vi.mock('@/utils/download', () => ({
  saveBlobResponse: vi.fn(),
}))

// ── import mocked api / element-plus bindings for per-test control ──────────
import {
  exportPaymentReport,
  exportRegistrations,
  getRegistrationDetail,
  getRegistrationPayments,
  updateRemark,
} from '@/api/activity'
import { saveBlobResponse } from '@/utils/download'
import { ElMessage } from 'element-plus'

// ── import View after mocks ────────────────────────────────────────────────
import ActivityRegistrationView from '@/views/activity/ActivityRegistrationView.vue'

// ── global stubs ───────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-table': { template: '<div><slot /></div>', methods: { clearSelection: vi.fn(), toggleRowSelection: vi.fn() } },
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
  'el-alert': {
    props: ['title'],
    template: '<div><span>{{ title }}</span><slot /></div>',
  },
  'el-icon': { template: '<span />' },
  RegistrationPaymentDialog: true,
  RegistrationTimeline: true,
  RegistrationEditBasicDialog: true,
  RegistrationCreateDialog: true,
  RegistrationAddCourseDialog: true,
  RegistrationAddSupplyDialog: true,
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
    mockMatchStatusFilter.value = ''
    mockList.value = []
    mockLoading.value = false
    mockTermStore.school_year = 114
    mockTermStore.semester = 1
    mockFetchList.mockResolvedValue(undefined)
    mockLoadOptions.mockResolvedValue(undefined)
    mockBatchMarkPaid.mockResolvedValue(undefined)
    mockLoading.value = false
    mockTermStore.school_year = 114
    mockTermStore.semester = 1
  })

  it('載入後呼叫 fetchList 和 loadOptions', async () => {
    mountView()
    await flushPromises()

    expect(mockFetchList).toHaveBeenCalledOnce()
    expect(mockLoadOptions).toHaveBeenCalledOnce()
  })

  it('有選取列時顯示批次工具列', async () => {
    const wrapper = mountView()
    await flushPromises()
    // 勾選同一 match_status 群組 → view 內 selectedRows 更新
    wrapper.vm.handleSelectionChange([
      { id: 1, match_status: 'matched' },
      { id: 2, match_status: 'matched' },
    ])
    await flushPromises()

    expect(wrapper.find('.batch-toolbar').exists()).toBe(true)
  })

  it('未選取時不顯示批次工具列', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.batch-toolbar').exists()).toBe(false)
  })

  it('列表載入中忽略勾選，避免批次操作舊列表', async () => {
    const wrapper = mountView()
    await flushPromises()
    mockLoading.value = true

    wrapper.vm.handleSelectionChange([{ id: 1, match_status: 'matched' }])
    await flushPromises()

    expect(wrapper.vm.selectedRows).toEqual([])
    expect(wrapper.find('.batch-toolbar').exists()).toBe(false)
  })

  it('已收件群組點擊「標記已繳費」呼叫 batchMarkPaid(true, ids, fn)', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([
      { id: 1, match_status: 'matched' },
      { id: 2, match_status: 'matched' },
    ])
    await flushPromises()

    const btn = wrapper.find('.batch-toolbar button')
    await btn.trigger('click')
    await flushPromises()

    expect(mockBatchMarkPaid).toHaveBeenCalledWith(true, [1, 2], expect.any(Function))
  })

  it('選取後若學期已切換，批次送出會 fail-closed 並清除選取', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([{ id: 1, match_status: 'matched' }])
    expect(wrapper.vm.selectedRows).toHaveLength(1)

    mockTermStore.semester = 2
    await wrapper.vm.handleBatchMarkPaid(true)

    expect(mockBatchMarkPaid).not.toHaveBeenCalled()
    expect(wrapper.vm.selectedRows).toEqual([])
  })

  it('Excel 匯出帶入畫面報名狀態與 include_inactive 口徑', async () => {
    vi.mocked(exportRegistrations).mockResolvedValue({ data: new Blob(), headers: {} })
    const wrapper = mountView()
    await flushPromises()

    mockMatchStatusFilter.value = 'rejected'
    await wrapper.vm.handleExport()

    expect(exportRegistrations).toHaveBeenCalledWith(expect.objectContaining({
      match_status: 'rejected',
      include_inactive: true,
      school_year: 114,
      semester: 1,
    }))
    // 下載走共用 saveBlobResponse（後端 Content-Disposition 檔名優先）
    expect(saveBlobResponse).toHaveBeenCalled()
  })

  it('繳費報表匯出帶畫面篩選與學期（不含 match_status）', async () => {
    vi.mocked(exportPaymentReport).mockResolvedValue({ data: new Blob(), headers: {} })
    const wrapper = mountView()
    await flushPromises()

    mockMatchStatusFilter.value = 'rejected'
    await wrapper.vm.handleExportPaymentReport()

    expect(exportPaymentReport).toHaveBeenCalledWith(expect.objectContaining({
      school_year: 114,
      semester: 1,
    }))
    // payment-report 端點無 match_status 參數，不可誤帶
    const args = vi.mocked(exportPaymentReport).mock.calls.at(-1)[0]
    expect(args).not.toHaveProperty('match_status')
    expect(saveBlobResponse).toHaveBeenCalled()
  })

  // ── 資安（#3 2026-07-30）：切換學期後批次操作誤打上一學期資料 ─────────────
  // Bug：composable 的學期 watcher 只重置 page/filter 並重新載入列表，不碰選取
  // 狀態；使用者若在切換學期前已勾選批次，切換後 selectedRows 仍持有上一學期的
  // 報名列，此時點批次操作會誤把上一學期資料一併處理。
  it('切換學期後，selectedRows 被清空', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([
      { id: 1, match_status: 'matched' },
      { id: 2, match_status: 'matched' },
    ])
    await flushPromises()
    expect(wrapper.vm.selectedRows).toHaveLength(2)

    mockTermStore.semester = 2
    await flushPromises()

    expect(wrapper.vm.selectedRows).toHaveLength(0)
    expect(wrapper.find('.batch-toolbar').exists()).toBe(false)
  })

  it('切換學年度（school_year）同樣會清空 selectedRows', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([{ id: 1, match_status: 'matched' }])
    await flushPromises()
    expect(wrapper.vm.selectedRows).toHaveLength(1)

    mockTermStore.school_year = 115
    await flushPromises()

    expect(wrapper.vm.selectedRows).toHaveLength(0)
  })

  it('loading 中時，批次工具列整個隱藏（避免用刷新前的舊選取送出批次操作）', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([
      { id: 1, match_status: 'matched' },
      { id: 2, match_status: 'matched' },
    ])
    await flushPromises()
    expect(wrapper.find('.batch-toolbar').exists()).toBe(true)

    mockLoading.value = true
    await flushPromises()

    // staging 側守衛比原分支更強：toolbar v-if 含 !loading，loading 中直接不渲染
    expect(wrapper.find('.batch-toolbar').exists()).toBe(false)
  })

  // ── 批量勾選分類收斂（回歸）──────────────────────────────────────────────
  // Bug：舊邏輯以完全相同的 match_status 分群，導致「系統自動」「人工指定」
  // 「強行收件」這些都屬於已完成報名的狀態彼此無法勾選在一起。現改以三分類
  // （待審核 / 已拒絕 / 報名成功）分群，同分類下不同 match_status 應可共選。
  it('報名成功分類下，不同 match_status（matched/manual/forced）可一起勾選', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([
      { id: 1, match_status: 'matched' },
      { id: 2, match_status: 'manual' },
      { id: 3, match_status: 'forced' },
    ])
    await flushPromises()

    expect(wrapper.vm.selectedRows).toHaveLength(3)
    expect(wrapper.vm.selectionCategory).toBe('success')
    expect(wrapper.text()).toContain('已選 3 筆 · 狀態：報名成功')
  })

  it('跨分類全選（待審核＋報名成功）會收斂到第一筆的分類並提示', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.handleSelectionChange([
      { id: 1, match_status: 'pending' },
      { id: 2, match_status: 'matched' },
    ])
    await flushPromises()

    expect(wrapper.vm.selectedRows.map((r) => r.id)).toEqual([1])
    expect(wrapper.vm.selectionCategory).toBe('pending')
    expect(ElMessage.info).toHaveBeenCalled()
  })

  // ── 繳費資訊載入失敗防超繳（回歸）────────────────────────────────────────
  // Bug：detail 載入成功（total_amount=全額）但 payments 端點失敗時，
  // paymentInfo.paid_amount 停在 0，openPaymentDialog 既有守衛只擋「載入中」，
  // 失敗後仍放行 → dialog 以 computeOwed(全額, 0)=全額 預填 → 重複收款超繳。
  it('繳費資訊載入失敗後，開繳費對話框被擋下（防全額預填超繳）', async () => {
    getRegistrationDetail.mockResolvedValue({
      data: { id: 7, total_amount: 1500, courses: [], supplies: [] },
    })
    getRegistrationPayments.mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.vm.openDetail({ id: 7 })
    await flushPromises()

    // 失敗態：loading 已關、paid_amount 停在 0、detail 全額已載入
    expect(wrapper.vm.loadingPayments).toBe(false)
    expect(wrapper.vm.paymentInfo.paid_amount || 0).toBe(0)

    ElMessage.warning.mockClear()
    wrapper.vm.openPaymentDialog('payment')

    // 必須被擋：dialog 不可開啟，且提示使用者
    expect(wrapper.vm.paymentDialogVisible).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('繳費資訊載入成功後，開繳費對話框正常開啟（對照組）', async () => {
    getRegistrationDetail.mockResolvedValue({
      data: { id: 8, total_amount: 1500, courses: [], supplies: [] },
    })
    getRegistrationPayments.mockResolvedValue({
      data: { total_amount: 1500, paid_amount: 500, payment_status: 'partial', records: [] },
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.vm.openDetail({ id: 8 })
    await flushPromises()

    wrapper.vm.openPaymentDialog('payment')
    expect(wrapper.vm.paymentDialogVisible).toBe(true)
  })

  // ── 內部審核註記（internal_note，唯讀）─────────────────────────────────
  it('detail.internal_note 非空時，詳情抽屜顯示唯讀內部審核註記區塊', async () => {
    getRegistrationDetail.mockResolvedValue({
      data: {
        id: 9,
        total_amount: 0,
        courses: [],
        supplies: [],
        internal_note: '[已拒絕 by 王老師] 資料不符\n[已還原 by 李老師]',
      },
    })
    getRegistrationPayments.mockResolvedValue({
      data: { total_amount: 0, paid_amount: 0, payment_status: 'unpaid', records: [] },
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.vm.openDetail({ id: 9 })
    await flushPromises()

    expect(wrapper.text()).toContain('內部審核註記')
    expect(wrapper.text()).toContain('[已拒絕 by 王老師] 資料不符')
    expect(wrapper.text()).toContain('[已還原 by 李老師]')
  })

  it('detail.internal_note 為空/undefined 時，不顯示內部審核註記區塊', async () => {
    getRegistrationDetail.mockResolvedValue({
      data: { id: 10, total_amount: 0, courses: [], supplies: [] },
    })
    getRegistrationPayments.mockResolvedValue({
      data: { total_amount: 0, paid_amount: 0, payment_status: 'unpaid', records: [] },
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.vm.openDetail({ id: 10 })
    await flushPromises()

    expect(wrapper.text()).not.toContain('內部審核註記')
  })

  it('課程明細只有 enrolled 顯示金額，其餘配位狀態一律顯示未計費', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.vm.courseBillingLabel({ status: 'enrolled', price: 1500 })).toBe('$1500')
    for (const status of [
      'waitlist',
      'promoted_pending',
      'pending_review',
      'pending_review_waitlist',
    ]) {
      expect(wrapper.vm.courseBillingLabel({ status, price: 9876 })).toBe('未計費')
    }
  })

  it('inactive/rejected 詳情只供查閱，隱藏一般 mutation 並在方法邊界 fail-closed', async () => {
    getRegistrationDetail.mockResolvedValue({
      data: {
        id: 11,
        is_active: false,
        match_status: 'rejected',
        student_name: '已拒絕學生',
        remark: '保留的歷史備註',
        total_amount: 0,
        courses: [
          { id: 1, course_id: 10, name: '美術', price: 1500, status: 'pending_review' },
        ],
        supplies: [],
        changes: [],
      },
    })
    getRegistrationPayments.mockResolvedValue({
      data: { total_amount: 0, paid_amount: 0, payment_status: 'no_fee', records: [] },
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.vm.openDetail({ id: 11 })
    await flushPromises()

    expect(wrapper.vm.isDetailReadOnly).toBe(true)
    expect(wrapper.vm.canMutateDetail).toBe(false)
    const alert = wrapper.get('[data-test="inactive-detail-alert"]')
    expect(alert.text()).toContain('已拒絕')
    expect(alert.text()).toContain('唯讀')
    expect(wrapper.get('[data-test="readonly-remark"]').text()).toContain('保留的歷史備註')
    expect(wrapper.text()).not.toContain('課程（總計')

    for (const label of ['新增繳費', '新增退費', '新增課程', '新增用品', '儲存備註']) {
      expect(wrapper.findAll('button').some((button) => button.text().includes(label))).toBe(false)
    }

    wrapper.vm.openPaymentDialog('payment')
    wrapper.vm.openEditBasicDialog()
    await wrapper.vm.openAddCourseDialog()
    wrapper.vm.openAddSupplyDialog()
    await wrapper.vm.saveRemark()

    expect(wrapper.vm.paymentDialogVisible).toBe(false)
    expect(wrapper.vm.editBasicDialogVisible).toBe(false)
    expect(wrapper.vm.addCourseDialogVisible).toBe(false)
    expect(wrapper.vm.addSupplyDialogVisible).toBe(false)
    expect(updateRemark).not.toHaveBeenCalled()
  })
})
