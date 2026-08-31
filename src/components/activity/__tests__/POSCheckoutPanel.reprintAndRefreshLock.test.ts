import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// FECASH-06（2026-08-24 bug hunt）：收據對話框重複點「列印收據」一再開出未標補印的正本。
//   第二次以後仍送 reprint=false → 市面上出現兩張外觀相同的正本，後端稽核也記成兩次
//   「列印」而非「補印」。注意 2026-08-15 才修好反向的 bug（首印被誤標補印），
//   **首次列印必須是 reprint=false**。
//
// CONC-03 附帶：送出期間手動刷新按鈕不得可按（那顆刷新在途時，結帳後的刷新會被
//   去重層吞成結帳前的快照）。

const getClassroomsMock = vi.hoisted(() => vi.fn(async () => ({ data: { items: [] } })))
vi.mock('@/api/classrooms', () => ({ getClassrooms: getClassroomsMock }))

const state = vi.hoisted(() => ({
  printReceipt: vi.fn(async () => true),
  refreshRecentTransactions: vi.fn(),
  refreshDailySummary: vi.fn(),
}))

vi.mock('@/composables/usePOSCheckout', async () => {
  const { ref, reactive, computed } = await import('vue')
  const lastReceipt = ref<Record<string, unknown> | null>(null)
  const submitting = ref(false)
  return {
    usePOSCheckout: () => ({
      mode: ref('by-student'),
      searchQuery: ref(''),
      classroomFilter: ref(''),
      searching: ref(false),
      searchGroups: ref([]),
      searchRegistrations: ref([]),
      searchError: ref(false),
      searchTruncation: reactive({ truncated: false, total: 0 }),
      triggerSearch: vi.fn(),
      runSearch: vi.fn(),
      checkoutType: ref('payment'),
      isRefundMode: ref(false),
      refundSuggestionLoading: ref(false),
      selectedItem: ref(null),
      itemTotal: computed(() => 0),
      selectItem: vi.fn(),
      clearSelection: vi.fn(),
      updateSelectedAmount: vi.fn(),
      resetTransactionInputs: vi.fn(),
      notes: ref(''),
      canSubmit: computed(() => false),
      refundApprovalBlocked: computed(() => false),
      submitting,
      submit: vi.fn(),
      lastReceipt,
      receiptDialogVisible: ref(true),
      printReceipt: (...args: unknown[]) => state.printReceipt(...(args as [])),
      reprintTransaction: vi.fn(),
      dailySummary: reactive({ data: null, loading: false, error: false }),
      refreshDailySummary: (...args: unknown[]) => state.refreshDailySummary(...(args as [])),
      recentTransactions: reactive({
        items: [],
        loading: false,
        total: 0,
        truncated: false,
        error: false,
      }),
      refreshRecentTransactions: (...args: unknown[]) =>
        state.refreshRecentTransactions(...(args as [])),
      // 測試用逃生口：讓 it 能改 composable 側的 ref
      __refs: { lastReceipt, submitting },
    }),
  }
})

import POSCheckoutPanel from '../POSCheckoutPanel.vue'
import { usePOSCheckout } from '@/composables/usePOSCheckout'

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
        'el-alert': slotStub(),
        'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
        'el-icon': true,
        'el-table': true,
        'el-table-column': true,
        'el-tag': slotStub('span'),
      },
    },
  })
}

type PosRefs = {
  __refs: {
    lastReceipt: { value: Record<string, unknown> | null }
    submitting: { value: boolean }
  }
}
const posRefs = () => (usePOSCheckout() as unknown as PosRefs).__refs

function printButton(wrapper: ReturnType<typeof mountPanel>) {
  const btn = wrapper
    .findAll('button')
    .find((b) => /列印收據|補印收據|重印收據/.test(b.text()))
  if (!btn) throw new Error('找不到列印按鈕')
  return btn
}

describe('POSCheckoutPanel 收據列印與送出期間刷新鎖', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.printReceipt = vi.fn(async () => true)
    state.refreshRecentTransactions = vi.fn()
    state.refreshDailySummary = vi.fn()
    posRefs().lastReceipt.value = {
      receipt_no: 'POS-20260824-A1',
      type: 'payment',
      total: 2000,
      items: [],
    }
    posRefs().submitting.value = false
  })

  it('FECASH-06：首次列印送 reprint=false，第二次起送 reprint=true 且按鈕改成「補印收據」', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(printButton(wrapper).text()).toContain('列印收據')
    await printButton(wrapper).trigger('click')
    await flushPromises()
    expect(state.printReceipt).toHaveBeenNthCalledWith(1, { reprint: false })

    // 同一張收據再按一次＝補印，不可再開出一張未標補印的正本
    expect(printButton(wrapper).text()).toContain('補印收據')
    await printButton(wrapper).trigger('click')
    await flushPromises()
    expect(state.printReceipt).toHaveBeenNthCalledWith(2, { reprint: true })
  })

  it('FECASH-06：換一張新收據後回到首印（reprint=false）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await printButton(wrapper).trigger('click')
    await flushPromises()

    posRefs().lastReceipt.value = {
      receipt_no: 'POS-20260824-B2',
      type: 'payment',
      total: 500,
      items: [],
    }
    await flushPromises()

    expect(printButton(wrapper).text()).toContain('列印收據')
    await printButton(wrapper).trigger('click')
    await flushPromises()
    expect(state.printReceipt).toHaveBeenLastCalledWith({ reprint: false })
  })

  it('FECASH-06：從交易列表重印的收據（is_reprint）第一次就是補印（沿用「重印收據」文案）', async () => {
    posRefs().lastReceipt.value = {
      receipt_no: 'POS-20260824-C3',
      type: 'payment',
      total: 800,
      items: [],
      is_reprint: true,
    }
    const wrapper = mountPanel()
    await flushPromises()

    expect(printButton(wrapper).text()).toContain('重印收據')
    await printButton(wrapper).trigger('click')
    await flushPromises()
    expect(state.printReceipt).toHaveBeenNthCalledWith(1, { reprint: true })
  })

  it('FECASH-06：首印失敗時旗標放回去，補救的那次仍是正本（reprint=false）', async () => {
    state.printReceipt = vi.fn(async () => false)
    const wrapper = mountPanel()
    await flushPromises()

    await printButton(wrapper).trigger('click')
    await flushPromises()
    expect(state.printReceipt).toHaveBeenNthCalledWith(1, { reprint: false })
    expect(printButton(wrapper).text()).toContain('列印收據')

    state.printReceipt = vi.fn(async () => true)
    await printButton(wrapper).trigger('click')
    await flushPromises()
    expect(state.printReceipt).toHaveBeenNthCalledWith(1, { reprint: false })
  })

  it('CONC-03：送出期間「重新整理」按鈕停用', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('重新整理'))
    expect(refreshBtn).toBeTruthy()
    expect(refreshBtn!.attributes('disabled')).toBeUndefined()

    posRefs().submitting.value = true
    await flushPromises()

    const lockedBtn = wrapper.findAll('button').find((b) => b.text().includes('重新整理'))
    expect(lockedBtn!.attributes('disabled')).toBeDefined()
  })
})
