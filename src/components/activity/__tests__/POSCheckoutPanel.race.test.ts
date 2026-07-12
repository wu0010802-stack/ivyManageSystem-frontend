import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// review P3（2026-07-12）：loadClassroomOptions 無請求序號守衛。切學期時 watch 會重載班級
// 選項，較慢的舊學期回應可最後覆寫 → POS 班級篩選顯示舊學期班級。修正：加 seq 守衛。

const getClassroomsMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/classrooms', () => ({ getClassrooms: getClassroomsMock }))

// usePOSCheckout 依賴一整組 refs/fns；本測只驗 loadClassroomOptions 序號守衛，故整組 stub
// 成 no-op refs，避免 mount 時真 composable 打 API。
vi.mock('@/composables/usePOSCheckout', async () => {
  const { ref, reactive } = await import('vue')
  return {
    usePOSCheckout: () => ({
      mode: ref('checkout'),
      searchQuery: ref(''),
      classroomFilter: ref(''),
      overdueOnly: ref(false),
      searching: ref(false),
      searchGroups: ref([]),
      searchRegistrations: ref([]),
      searchTruncation: ref({ truncated: false, total: 0 }),
      triggerSearch: vi.fn(),
      runSearch: vi.fn(),
      checkoutType: ref('payment'),
      isRefundMode: ref(false),
      selectedItem: ref(null),
      itemTotal: ref(0),
      selectItem: vi.fn(),
      clearSelection: vi.fn(),
      updateSelectedAmount: vi.fn(),
      resetTransactionInputs: vi.fn(),
      notes: ref(''),
      canSubmit: ref(false),
      refundApprovalBlocked: ref(false),
      submitting: ref(false),
      submit: vi.fn(),
      lastReceipt: ref({ items: [], change: null, payment_method: '' }),
      receiptDialogVisible: ref(false),
      printReceipt: vi.fn(),
      reprintTransaction: vi.fn(),
      dailySummary: reactive({ data: null }),
      refreshDailySummary: vi.fn(),
      recentTransactions: reactive({ items: [] }),
      refreshRecentTransactions: vi.fn(),
    }),
  }
})

import POSCheckoutPanel from '../POSCheckoutPanel.vue'
import { useAcademicTermStore } from '@/stores/academicTerm'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function mountPanel() {
  return mount(POSCheckoutPanel, {
    global: {
      stubs: {
        AcademicTermSelector: true,
        POSDailySummaryBar: true,
        POSPaymentPanel: true,
        POSSearchPanel: true,
        'el-button': true,
        'el-dialog': true,
        'el-icon': true,
      },
    },
  })
}

describe('POSCheckoutPanel loadClassroomOptions 請求序號守衛（review P3）', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.clearAllMocks())

  it('切學期後舊學期班級不覆寫新學期選項', async () => {
    const c1 = deferred<unknown>()
    const c2 = deferred<unknown>()
    getClassroomsMock.mockReturnValueOnce(c1.promise).mockReturnValueOnce(c2.promise)

    const wrapper = mountPanel()
    await flushPromises() // mount → loadClassroomOptions #1（c1 pending）

    const termStore = useAcademicTermStore()
    termStore.setTerm(termStore.school_year + 1, termStore.semester) // watch → #2
    await flushPromises()

    c2.resolve({ data: { items: [{ name: '新學期班' }] } })
    await flushPromises()
    c1.resolve({ data: { items: [{ name: '舊學期班' }] } }) // 遲到
    await flushPromises()

    const ss = wrapper.vm.$.setupState as { classroomOptions: string[] }
    expect(ss.classroomOptions).toEqual(['新學期班'])
    wrapper.unmount()
  })
})
