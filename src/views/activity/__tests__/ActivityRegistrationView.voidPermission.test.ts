import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// audit C-4（2026-07-02）：報名詳情「軟刪」繳費按鈕舊版只看 ACTIVITY_WRITE，
// 但後端 DELETE /registrations/{id}/payments/{pid} 守衛是 ACTIVITY_PAYMENT_APPROVE
// （registrations_payments.py）。「有 WRITE、無簽核權」正是櫃台人員配置——
// 填完 ≥5 字原因送出才吃 403。按鈕 gate 必須對齊後端（POS 頁 canApproveRefund
// 已有同款前端閘）。

const granted = new Set<string>()

vi.mock('@/utils/auth', () => ({
  hasPermission: (p: string) => granted.has(p),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

vi.mock('@/api/activity', () => ({
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
  listPendingRegistrations: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
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
    courseFilter: ref(''),
    classroomFilter: ref(''),
    courseOptions: ref([]),
    classroomOptions: ref([]),
    selectedIds: ref([]),
    savingBatch: ref(false),
    initFromQuery: vi.fn(),
    fetchList: vi.fn(),
    handleSearch: vi.fn(),
    batchMarkPaid: vi.fn(),
    loadOptions: vi.fn(),
  }),
}))

vi.mock('@/composables/useCountdownBanner', () => ({
  useCountdownBanner: () => ({ banner: ref('') }),
  countdownLabel: () => '',
}))

import ActivityRegistrationView from '../ActivityRegistrationView.vue'

const mountView = () =>
  mount(ActivityRegistrationView, {
    shallow: true,
    global: {
      stubs: {
        AcademicTermSelector: true,
        // shallow 的預設 stub 仍會渲染 scoped slot（無 row 可解構會炸），
        // 表格相關一律換成不渲染 slot 的空 stub
        'el-table': { template: '<div />' },
        'el-table-column': { template: '<div />' },
      },
    },
  })

describe('ActivityRegistrationView — 軟刪繳費按鈕權限 gate（audit C-4）', () => {
  beforeEach(() => {
    granted.clear()
  })

  it('有 WRITE、無 PAYMENT_APPROVE（櫃台配置）→ 軟刪 gate 關、一般寫入 gate 開', () => {
    granted.add('ACTIVITY_READ')
    granted.add('ACTIVITY_WRITE')
    const wrapper = mountView()
    expect(wrapper.vm.canWrite).toBe(true)
    expect(wrapper.vm.canVoidPayment).toBe(false)
  })

  it('具 PAYMENT_APPROVE → 軟刪 gate 開', () => {
    granted.add('ACTIVITY_READ')
    granted.add('ACTIVITY_WRITE')
    granted.add('ACTIVITY_PAYMENT_APPROVE')
    const wrapper = mountView()
    expect(wrapper.vm.canVoidPayment).toBe(true)
  })
})
