import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// POS code review 2026-08-15：
//
// P2-07：今日交易列表只取前 N 筆，標題卻寫「今日交易 (N)」——旺季一天上百張時，
//   櫃台會把「顯示筆數」當成「今日總張數」對帳。標題改為「顯示 N／共 M 張」，
//   被截斷時另加提示。
//
// P3-07：refundSuggestionLoading 雖已由 composable export 卻從未下傳，退費試算期間
//   送出鈕靜默 disable。必須傳給付款面板。

const getClassroomsMock = vi.hoisted(() => vi.fn(async () => ({ data: { items: [] } })))
vi.mock('@/api/classrooms', () => ({ getClassrooms: getClassroomsMock }))

const state = vi.hoisted(() => ({
  recent: { items: [] as unknown[], loading: false, total: 0, truncated: false, error: false },
  refundSuggestionLoading: false,
}))

vi.mock('@/composables/usePOSCheckout', async () => {
  const { ref, reactive, computed } = await import('vue')
  const recentTransactions = reactive(state.recent)
  const refundSuggestionLoading = ref(state.refundSuggestionLoading)
  return {
    usePOSCheckout: () => ({
      mode: ref('by-student'),
      searchQuery: ref(''),
      classroomFilter: ref(''),
      overdueOnly: ref(false),
      searching: ref(false),
      searchGroups: ref([]),
      searchRegistrations: ref([]),
      searchTruncation: reactive({ truncated: false, total: 0 }),
      triggerSearch: vi.fn(),
      runSearch: vi.fn(),
      checkoutType: ref('payment'),
      isRefundMode: ref(false),
      refundSuggestionLoading,
      selectedItem: ref(null),
      itemTotal: computed(() => 0),
      selectItem: vi.fn(),
      clearSelection: vi.fn(),
      updateSelectedAmount: vi.fn(),
      resetTransactionInputs: vi.fn(),
      notes: ref(''),
      canSubmit: computed(() => false),
      refundApprovalBlocked: computed(() => false),
      submitting: ref(false),
      submit: vi.fn(),
      lastReceipt: ref(null),
      receiptDialogVisible: ref(false),
      printReceipt: vi.fn(),
      reprintTransaction: vi.fn(),
      dailySummary: reactive({ data: null, loading: false, error: false }),
      refreshDailySummary: vi.fn(),
      recentTransactions,
      refreshRecentTransactions: vi.fn(),
    }),
  }
})

import POSCheckoutPanel from '../POSCheckoutPanel.vue'

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

function mountPanel() {
  return mount(POSCheckoutPanel, {
    global: {
      stubs: {
        POSDailySummaryBar: true,
        POSPaymentPanel: true,
        POSSearchPanel: true,
        'el-card': slotStub(),
        'el-button': slotStub('button'),
        'el-dialog': true,
        'el-icon': true,
        'el-table': true,
        'el-table-column': true,
        'el-tag': slotStub('span'),
      },
    },
  })
}

describe('POSCheckoutPanel 今日交易標題與截斷提示（P2-07）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.recent.items = []
    state.recent.total = 0
    state.recent.truncated = false
    state.recent.error = false
  })
  afterEach(() => vi.clearAllMocks())

  it('標題顯示「顯示 N／共 M 張」', () => {
    state.recent.items = [{ receipt_no: 'A' }, { receipt_no: 'B' }]
    state.recent.total = 137
    const wrapper = mountPanel()
    const title = wrapper.get('.pos-panel-wrap__recent-title').text()
    expect(title).toContain('顯示 2')
    expect(title).toContain('137')
  })

  it('被截斷時顯示提示', () => {
    state.recent.items = [{ receipt_no: 'A' }]
    state.recent.total = 137
    state.recent.truncated = true
    const wrapper = mountPanel()
    expect(wrapper.find('.pos-panel-wrap__recent-truncated').exists()).toBe(true)
  })

  it('未截斷時不顯示提示', () => {
    state.recent.items = [{ receipt_no: 'A' }]
    state.recent.total = 1
    const wrapper = mountPanel()
    expect(wrapper.find('.pos-panel-wrap__recent-truncated').exists()).toBe(false)
  })

  it('刷新失敗時顯示錯誤提示（P3-05）', () => {
    state.recent.error = true
    const wrapper = mountPanel()
    expect(wrapper.find('.pos-panel-wrap__recent-error').exists()).toBe(true)
  })
})

describe('POSCheckoutPanel 退費試算旗標下傳（P3-07）', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('把 refundSuggestionLoading 傳給付款面板', () => {
    const wrapper = mountPanel()
    const payment = wrapper.getComponent({ name: 'POSPaymentPanel' })
    expect(payment.props()).toHaveProperty('refundSuggestionLoading')
  })
})
