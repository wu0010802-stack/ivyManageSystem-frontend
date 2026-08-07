import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// 稽核（2026-08-06）：已拒絕（軟刪）報名的詳情抽屜。
//
// 後端 GET /activity/registrations/{id} 放寬為 or_(is_active, match_status=='rejected')
// 後，已拒絕報名不再 404 → 抽屜開得起來。前端要保證：
//   ① 開詳情不噴錯、內容渲染得出來
//   ② 所有寫入型動作（編輯基本資料／加課／加用品／收款／退費／備註）隱藏
//      ——那些端點仍要求 is_active=True，按下去只會 404/400
//   ③ 明確標示「此報名已拒絕」＋拒絕原因
//   ④ 繳費／退費沖帳明細載得出來：get_registration_payments 本來就允許讀軟刪列
//      （docstring 明寫供財務查核），而後台唯一的退費明細入口就是這個抽屜。
//      舊行為是詳情先 404 → 進 catch → loadPayments 永遠不會被呼叫。
//
// ⚠ fixture 形狀：後端 RegistrationDetailOut **沒有 is_active 欄位**，
//    production 的 payload 只會帶 match_status='rejected'。這裡刻意不塞
//    is_active: false，避免靠一個 production 產不出來的欄位假綠。

vi.mock('@/components/activity/RegistrationTimeline.vue', () => ({
  default: { name: 'RegistrationTimeline', render: () => null },
}))
vi.mock('@/components/activity/RegistrationPaymentDialog.vue', () => ({
  default: { name: 'RegistrationPaymentDialog', render: () => null },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

// 全權限：確保「按鈕不見」是因為報名已拒絕，而不是因為沒有 ACTIVITY_WRITE
vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('@/utils/format', () => ({
  formatActivityDate: (v: string) => v || '',
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
  // 審核工作流 API（useActivityReview 於 setup 匯入；本檔不觸發）
  matchRegistration: vi.fn(),
  rejectRegistration: vi.fn(),
  rematchRegistration: vi.fn(),
  rematchAllPendingRegistrations: vi.fn(),
  forceAcceptRegistration: vi.fn(),
  restoreRegistration: vi.fn(),
  searchActivityStudents: vi.fn(),
  fetchMatchSuggestions: vi.fn(),
}))

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
    fetchList: vi.fn(),
    handleSearch: vi.fn(),
    batchMarkPaid: vi.fn(),
    loadOptions: vi.fn(),
  }),
}))

vi.mock('@/composables/useCountdownBanner', () => ({
  useCountdownBanner: () => ({ banner: ref(null) }),
  countdownLabel: () => '',
}))

import { ElMessage } from 'element-plus'
import ActivityRegistrationView from '../ActivityRegistrationView.vue'

const STUBS = {
  AcademicTermSelector: true,
  PageHeader: true,
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-table': { template: '<div />' },
  'el-table-column': { template: '<div />' },
  'el-pagination': true,
  'el-drawer': { template: '<div><slot /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-skeleton': true,
  'el-descriptions': { template: '<div><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-timeline': { template: '<div><slot /></div>' },
  'el-timeline-item': { template: '<div><slot /></div>' },
  'el-alert': {
    props: ['title'],
    template: '<div><span>{{ title }}</span><slot /></div>',
  },
  'el-tooltip': { template: '<div><slot /></div>' },
  'el-icon': { template: '<span />' },
  'el-empty': true,
  RegistrationTimeline: true,
  RegistrationPaymentDialog: true,
  RegistrationEditBasicDialog: true,
  RegistrationCreateDialog: true,
  RegistrationAddCourseDialog: true,
  RegistrationAddSupplyDialog: true,
  RegistrationMatchDialog: true,
  RegistrationRematchForceDialog: true,
  RegistrationReviewWizard: true,
}

interface ViewVm {
  openDetail: (row: { id: number }) => Promise<void>
  detail: { id: number; student_name?: string } | null
}

function mountView() {
  return mount(ActivityRegistrationView, {
    global: {
      directives: { loading: () => {} },
      stubs: STUBS,
    },
  })
}

// 已拒絕、且拒絕前已繳費（先繳 1500 → 拒絕時自動沖帳退 1500）的 production 形狀 payload
const rejectedDetail = {
  id: 77,
  match_status: 'rejected',
  student_name: '陳小明',
  class_name: '大班A',
  birthday: null,
  parent_phone: '0912345678',
  email: 'parent@example.com',
  remark: '家長備註',
  internal_note: '[已拒絕 by 王老師] 重複報名，與 #71 為同一位學生',
  total_amount: 1500,
  paid_amount: 0,
  payment_status: 'unpaid',
  courses: [{ id: 5, course_id: 10, name: '美術', price: 1500, status: 'enrolled' }],
  supplies: [{ id: 3, supply_id: 8, name: '畫具組', price: 300 }],
  changes: [
    {
      id: 2,
      change_type: '拒絕報名',
      description: '拒絕原因：重複報名，與 #71 為同一位學生（自動沖帳退費 NT$1500）',
      changed_by: '王老師',
      created_at: '2026-08-05 10:00',
    },
    {
      id: 1,
      change_type: '新增繳費',
      description: '繳費 NT$1500',
      changed_by: '王老師',
      created_at: '2026-08-01 09:00',
    },
  ],
  created_at: '2026-07-30 08:00',
}

const rejectedPayments = {
  total_amount: 1500,
  paid_amount: 0,
  payment_status: 'unpaid',
  records: [
    {
      id: 1,
      type: 'payment',
      amount: 1500,
      payment_date: '2026-08-01',
      payment_method: '現金',
      notes: '',
      is_voided: false,
    },
    {
      id: 2,
      type: 'refund',
      amount: 1500,
      payment_date: '2026-08-05',
      payment_method: '系統補齊',
      notes: '拒絕報名自動沖帳',
      is_voided: false,
    },
  ],
}

// 課程／用品列的「退課」「移除」不列入：它們在 el-table 的 scoped slot 內，
// 本檔把 el-table 換成不渲染 slot 的空 stub（渲染 scoped slot 會因無 row 可解構而炸），
// 列進來只會得到永遠成立的空斷言。兩者與此處按鈕共用同一個 canMutateDetail 閘。
const WRITE_BUTTON_LABELS = ['編輯', '新增繳費', '新增退費', '新增課程', '新增用品', '儲存備註', '軟刪']

function buttonLabels(wrapper: ReturnType<typeof mountView>): string[] {
  return wrapper.findAll('button').map((b) => b.text())
}

describe('ActivityRegistrationView — 已拒絕報名的詳情抽屜（唯讀＋退費明細）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistrationDetail.mockResolvedValue({ data: rejectedDetail })
    getRegistrationPayments.mockResolvedValue({ data: rejectedPayments })
  })

  it('已拒絕報名開詳情：不報錯、內容渲染、繳費/退費明細載得出來', async () => {
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as unknown as ViewVm
    await vm.openDetail({ id: 77 })
    await flushPromises()

    // ① 不報錯，詳情渲染得出來
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('陳小明')

    // ④ 退費明細（後台唯一入口）真的載得出來
    expect(getRegistrationPayments).toHaveBeenCalledWith(77)
    const history = wrapper.find('.payment-history')
    expect(history.exists()).toBe(true)
    expect(history.text()).toContain('退費')
    expect(history.text()).toContain('1,500')
    expect(history.text()).toContain('拒絕報名自動沖帳')
  })

  it('已拒絕報名：顯示「已拒絕」狀態標示與拒絕原因', async () => {
    const wrapper = mountView()
    await flushPromises()

    await (wrapper.vm as unknown as ViewVm).openDetail({ id: 77 })
    await flushPromises()

    const alert = wrapper.get('[data-test="inactive-detail-alert"]')
    expect(alert.text()).toContain('已拒絕')
    expect(alert.text()).toContain('唯讀')
    expect(wrapper.get('[data-test="rejection-reason"]').text()).toContain(
      '重複報名，與 #71 為同一位學生',
    )
  })

  it('已拒絕報名：所有寫入型動作都不顯示，備註改唯讀', async () => {
    const wrapper = mountView()
    await flushPromises()

    await (wrapper.vm as unknown as ViewVm).openDetail({ id: 77 })
    await flushPromises()

    const labels = buttonLabels(wrapper)
    for (const label of WRITE_BUTTON_LABELS) {
      expect(labels.some((t) => t.includes(label))).toBe(false)
    }
    expect(wrapper.get('[data-test="readonly-remark"]').text()).toContain('家長備註')
  })

  it('對照組：未拒絕（matched）報名的寫入動作照常顯示，證明上面的「不顯示」不是抽屜沒渲染', async () => {
    getRegistrationDetail.mockResolvedValue({
      data: { ...rejectedDetail, id: 78, match_status: 'matched', internal_note: '', changes: [] },
    })
    const wrapper = mountView()
    await flushPromises()

    await (wrapper.vm as unknown as ViewVm).openDetail({ id: 78 })
    await flushPromises()

    const labels = buttonLabels(wrapper)
    for (const label of ['編輯', '新增繳費', '新增課程', '新增用品', '儲存備註']) {
      expect(labels.some((t) => t.includes(label))).toBe(true)
    }
    expect(wrapper.find('[data-test="inactive-detail-alert"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rejection-reason"]').exists()).toBe(false)
  })
})
