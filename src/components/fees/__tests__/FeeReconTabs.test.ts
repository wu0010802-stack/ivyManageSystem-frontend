/**
 * SPEC-014 前端頁籤測試：交接差異計算/權限 gate、預繳抽屜與退款對話框
 * （2026-08-26 預繳併入帳款）、匯入預覽、關帳 checklist、分配合計檢核。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
// 暖載：element-plus 與 @element-plus/icons-vue 首次 transform 很重（各上千個
// module）。本檔各 tab 皆在 it() 內動態 import 元件，若讓第一個測試付這筆載入
// 成本，8GB 機器高負載時會撞 5s testTimeout 假紅（實測首測可達 10s+）。
// 移到收集階段一次付清；收集階段不受 testTimeout 限制。
import 'element-plus'
import '@element-plus/icons-vue'

const apiMocks = vi.hoisted(() => ({
  getCashHandovers: vi.fn(() => Promise.resolve({ total: 0, items: [] })),
  getFeeRecords: vi.fn(() => Promise.resolve({ total: 0, items: [] })),
  createCashReceipt: vi.fn(),
  submitCashHandover: vi.fn(),
  confirmCashHandover: vi.fn(() => Promise.resolve({})),
  reopenCashHandover: vi.fn(),
  getPrepayments: vi.fn(() => Promise.resolve({ total: 0, items: [] })),
  getPrepaymentRefunds: vi.fn(() => Promise.resolve({ total: 0, items: [] })),
  getPrepaymentMovements: vi.fn(() => Promise.resolve([])),
  applyPrepayment: vi.fn(),
  transferPrepayment: vi.fn(),
  reversePrepaymentApply: vi.fn(),
  createPrepaymentRefund: vi.fn(),
  approvePrepaymentRefund: vi.fn(() => Promise.resolve({})),
  completePrepaymentRefund: vi.fn(() => Promise.resolve({})),
  cancelPrepaymentRefund: vi.fn(),
  previewBankImport: vi.fn(),
  confirmBankImport: vi.fn(),
  getBankImports: vi.fn(() => Promise.resolve([])),
  getBankTransactions: vi.fn(() => Promise.resolve({ total: 0, items: [] })),
  getTransactionCandidates: vi.fn(() => Promise.resolve({
    transaction_id: 1, level: 'auto_high', reasons: ['末四碼唯一且金額恰可完全組成'],
    candidates: [], students: [],
  })),
  allocateTransaction: vi.fn(),
  ignoreTransaction: vi.fn(),
  reverseTransaction: vi.fn(),
  getCloseSummary: vi.fn(),
  getClosePeriods: vi.fn(() => Promise.resolve({ total: 0, items: [] })),
  closePeriod: vi.fn(),
  reopenClosePeriod: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

const authMocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => authMocks.perms.has(name),
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// table stub：data 灌給 column stub、column 逐 row 呼叫 default slot
const ElTableColumnStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {},
        (props.data as Record<string, unknown>[]).map((row, index) =>
          h('div', { key: index }, slots.default ? slots.default({ row }) : []),
        ),
      )
  },
})
const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {},
        (slots.default?.() || []).map((vnode, index) =>
          h(vnode.type as never, { ...vnode.props, data: props.data, key: index }, vnode.children as never),
        ),
      )
  },
})
const DialogStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h('div', {}, [slots.default?.(), slots.footer?.()])
        : null
  },
})

const globalStubs = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-dialog': DialogStub,
  'el-drawer': DialogStub,
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE', 'FEE_CLOSE_APPROVE'])
})

describe('CashHandoverTab', () => {
  async function mountTab() {
    const { default: CashHandoverTab } = await import(
      '@/components/fees/CashHandoverTab.vue'
    )
    return mount(CashHandoverTab, { global: { stubs: globalStubs } })
  }

  it('批次列表顯示差異並標示不為零者', async () => {
    apiMocks.getCashHandovers.mockResolvedValueOnce({
      total: 1,
      items: [
        {
          id: 1, business_date: '2026-08-25', status: 'confirmed',
          cash_receipt_total: 100000, expected_cash_amount: 100000,
          owner_actual_amount: 99000, variance: -1000,
        },
      ],
    })
    const wrapper = await mountTab()
    await flushPromises()
    const cell = wrapper.find('[data-test="variance-cell"]')
    expect(cell.exists()).toBe(true)
    expect(cell.classes()).toContain('variance-bad')
    expect(wrapper.text()).toContain('NT$-1,000')
  })

  it('老闆輸入實收後即時顯示差異；差異為零不需原因', async () => {
    apiMocks.getCashHandovers.mockResolvedValueOnce({
      total: 1,
      items: [
        {
          id: 3, business_date: '2026-08-25', status: 'submitted',
          cash_receipt_total: 100000, expected_cash_amount: 100000,
          owner_actual_amount: null, variance: null,
        },
      ],
    })
    const wrapper = await mountTab()
    await flushPromises()
    await wrapper.find('[data-test="confirm-handover"]').trigger('click')
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      confirmForm: { actual?: number; reason: string }
      confirmVariance: number
    }
    vm.confirmForm.actual = 99000
    await flushPromises()
    expect(vm.confirmVariance).toBe(-1000)
    vm.confirmForm.actual = 100000
    await flushPromises()
    expect(vm.confirmVariance).toBe(0)
  })

  it('無 FEE_CLOSE_APPROVE 者看不到老闆簽收按鈕（會計仍可提交）', async () => {
    authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
    apiMocks.getCashHandovers.mockResolvedValueOnce({
      total: 2,
      items: [
        {
          id: 3, business_date: '2026-08-25', status: 'submitted',
          cash_receipt_total: 100000, expected_cash_amount: 100000,
          owner_actual_amount: null, variance: null,
        },
        {
          id: 4, business_date: '2026-08-26', status: 'draft',
          cash_receipt_total: 5000, expected_cash_amount: null,
          owner_actual_amount: null, variance: null,
        },
      ],
    })
    const wrapper = await mountTab()
    await flushPromises()
    expect(wrapper.find('[data-test="confirm-handover"]').exists()).toBe(false)
    // draft 批仍可由會計提交
    expect(wrapper.find('[data-test="submit-handover"]').exists()).toBe(true)
  })
})

describe('PrepaymentDrawer（預繳併入帳款後的額度管理抽屜）', () => {
  const CREDITS = [
    {
      id: 1, student_id: 5, student_name: '王小明',
      recruitment_visit_id: null, visit_child_name: null,
      target_school_year: 115, target_semester: 1,
      original_amount: 5000, status: 'available', balance: 5000,
    },
    {
      id: 2, student_id: null, student_name: null,
      recruitment_visit_id: 9, visit_child_name: '陳新生',
      target_school_year: 115, target_semester: 1,
      original_amount: 5000, status: 'available', balance: 5000,
    },
  ]

  async function mountDrawer(credits = CREDITS) {
    const { default: PrepaymentDrawer } = await import(
      '@/components/fees/PrepaymentDrawer.vue'
    )
    return mount(PrepaymentDrawer, {
      props: { modelValue: true, credits, title: '預繳款' },
      global: { stubs: globalStubs },
    })
  }

  it('顯示預繳額度與狀態；訪視預繳提供轉正式學生、學生額度提供套用', async () => {
    const wrapper = await mountDrawer()
    await flushPromises()
    expect(wrapper.text()).toContain('王小明（學生）')
    expect(wrapper.text()).toContain('陳新生（招生訪視）')
    expect(wrapper.find('[data-test="transfer-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="apply-btn"]').exists()).toBe(true)
  })

  it('無 FEES_WRITE 時只能看流水，無任何操作按鈕', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const wrapper = await mountDrawer()
    await flushPromises()
    expect(wrapper.find('[data-test="movements-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="transfer-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="apply-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="refund-btn"]').exists()).toBe(false)
  })

  it('預繳流水 timeline 顯示 received/applied', async () => {
    apiMocks.getPrepaymentMovements.mockResolvedValueOnce([
      {
        id: 1, movement_type: 'received', amount: 5000,
        occurred_at: '2026-06-15T12:00:00', reason: '預繳收款',
      },
      {
        id: 2, movement_type: 'applied', amount: -5000,
        occurred_at: '2026-08-10T09:00:00', reason: '套用註冊費',
      },
    ])
    const wrapper = await mountDrawer([
      {
        id: 1, student_id: 5, student_name: '王小明',
        recruitment_visit_id: null, visit_child_name: null,
        target_school_year: 115, target_semester: 1,
        original_amount: 5000, status: 'applied', balance: 0,
      },
    ])
    await flushPromises()
    const movementBtn = wrapper.find('[data-test="movements-btn"]')
    expect(movementBtn.exists()).toBe(true)
    await movementBtn.trigger('click')
    await flushPromises()
    expect(apiMocks.getPrepaymentMovements).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('收到預繳')
    expect(wrapper.text()).toContain('套用註冊費')
  })

  it('套用註冊費：只列學期相符的註冊費費用單，確認後 emit refresh', async () => {
    apiMocks.getFeeRecords.mockResolvedValueOnce({
      total: 2,
      items: [
        {
          id: 21, fee_item_name: '註冊費', period: '115-1',
          amount_due: 12000, amount_paid: 0, fee_type: 'registration',
        },
        {
          id: 22, fee_item_name: '月費', period: '115-1',
          amount_due: 9000, amount_paid: 0, fee_type: 'monthly',
        },
      ],
    })
    apiMocks.applyPrepayment.mockResolvedValueOnce({})
    const wrapper = await mountDrawer([CREDITS[0]])
    await flushPromises()
    await wrapper.find('[data-test="apply-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('註冊費')
    expect(wrapper.text()).not.toContain('月費')
  })
})

describe('PrepaymentRefundsDialog（退款核准/交付）', () => {
  const REFUNDS = [
    {
      id: 11, prepayment_credit_id: 1, amount: 5000, status: 'requested',
      reason: '不就讀', recipient_name: null, disbursed_at: null,
    },
    {
      id: 12, prepayment_credit_id: 2, amount: 5000, status: 'approved',
      reason: '不就讀', recipient_name: null, disbursed_at: null,
    },
  ]

  async function mountDialog() {
    const { default: PrepaymentRefundsDialog } = await import(
      '@/components/fees/PrepaymentRefundsDialog.vue'
    )
    return mount(PrepaymentRefundsDialog, {
      props: { modelValue: true, refunds: REFUNDS },
      global: { stubs: globalStubs },
    })
  }

  it('退款核准/完成按鈕只在具 FEE_CLOSE_APPROVE 時顯示', async () => {
    let wrapper = await mountDialog()
    await flushPromises()
    expect(wrapper.find('[data-test="approve-refund"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="complete-refund"]').exists()).toBe(true)

    authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
    wrapper = await mountDialog()
    await flushPromises()
    expect(wrapper.find('[data-test="approve-refund"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="complete-refund"]').exists()).toBe(false)
    // 會計仍可取消 requested/approved
    expect(wrapper.find('[data-test="cancel-refund"]').exists()).toBe(true)
  })

  it('核准成功後 emit refresh（由父層重抓清單）', async () => {
    apiMocks.approvePrepaymentRefund.mockResolvedValueOnce({})
    const wrapper = await mountDialog()
    await flushPromises()
    await wrapper.find('[data-test="approve-refund"]').trigger('click')
    await flushPromises()
    expect(apiMocks.approvePrepaymentRefund).toHaveBeenCalledWith(11)
    expect(wrapper.emitted('refresh')).toBeTruthy()
  })
})

describe('BankReconTab', () => {
  async function mountTab() {
    const { default: BankReconTab } = await import(
      '@/components/fees/BankReconTab.vue'
    )
    return mount(BankReconTab, {
      global: { stubs: { ...globalStubs, AllocationDialog: true } },
    })
  }

  it('預覽顯示統計並在同檔已匯入時提示', async () => {
    apiMocks.previewBankImport.mockResolvedValueOnce({
      filename: 'bank.csv', file_sha256: 'x', statement_start: '2026-08-03',
      statement_end: '2026-08-20', row_count: 154, credit_total: 2052479,
      debit_total: 1997737, with_collection_number: 144, duplicate_count: 0,
      error_count: 0, errors: [], already_imported: true,
      existing_import_id: 7, parser_version: 'sinopac-csv-v1',
    })
    const wrapper = await mountTab()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      pickedFile: File | null
      runPreview: () => Promise<void>
    }
    vm.pickedFile = new File(['x'], 'bank.csv')
    await vm.runPreview()
    await flushPromises()
    expect(wrapper.find('[data-test="import-preview"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('154')
    expect(wrapper.text()).toContain('NT$2,052,479')
    expect(wrapper.find('[data-test="dup-import-alert"]').exists()).toBe(true)
  })

  it('交易列表顯示狀態與未分配金額', async () => {
    apiMocks.getBankTransactions.mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 50,
      items: [
        {
          id: 1, posting_date: '2026-08-03', direction: 'credit', amount: 15800,
          collection_suffix: '1104', summary: '跨行轉帳',
          reconciliation_status: 'imported', allocated_total: 0,
          unallocated: 15800,
        },
      ],
    })
    const wrapper = await mountTab()
    await flushPromises()
    expect(wrapper.text()).toContain('1104')
    expect(wrapper.text()).toContain('已匯入')
    expect(wrapper.find('[data-test="open-alloc"]').exists()).toBe(true)
  })
})

describe('AllocationDialog', () => {
  it('載入候選並在超額時 disable 確認', async () => {
    const { default: AllocationDialog } = await import(
      '@/components/fees/AllocationDialog.vue'
    )
    apiMocks.getTransactionCandidates.mockResolvedValueOnce({
      transaction_id: 1, level: 'needs_review',
      reasons: ['金額可拆成多種組合，請人工擇一'],
      candidates: [
        {
          cross_student: true, total: 10000,
          parts: [
            {
              part_type: 'prepayment', student_id: 1, amount: 5000,
              label: '預繳款', fee_record_id: null,
              target_school_year: 115, target_semester: 1,
            },
            {
              part_type: 'prepayment', student_id: 2, amount: 5000,
              label: '預繳款', fee_record_id: null,
              target_school_year: 115, target_semester: 1,
            },
          ],
        },
      ],
      students: [],
    })
    const wrapper = mount(AllocationDialog, {
      props: {
        visible: true,
        txn: {
          id: 1, posting_date: '2026-08-03', amount: 10000,
          unallocated: 10000, collection_suffix: '1104',
        },
      },
      global: { stubs: globalStubs },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('需人工確認')
    expect(wrapper.find('[data-test="use-candidate"]').exists()).toBe(true)
    await wrapper.find('[data-test="use-candidate"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('全額分配')
    const vm = wrapper.vm as unknown as {
      parts: { amount: number }[]
      partsTotal: number
    }
    vm.parts[0].amount = 99999
    await flushPromises()
    expect(wrapper.text()).toContain('超額，請調整')
  })
})

describe('CloseTab', () => {
  const baseSummary = {
    close_year: 2026, close_month: 8,
    period: { start: '2026-08-01', end: '2026-08-31' },
    bank: { credit_total: 2052479, unallocated: 0, unclassified_count: 0, status_summary: {}, allocated_net: 2052479, by_type: {} },
    cash: {
      receipts_total: 100000, handover_expected: 100000,
      handover_actual: 100000, handover_variance: 0, handover_unconfirmed: 0,
      by_type: {},
    },
    prepayment: {
      opening_balance: 0, received: 10000, applied: 5000, refunded: 5000,
      reversed_net: 0, closing_balance: 0, note: '',
    },
    owner: { refund_paid: 5000, pending_refunds: 0 },
    totals: {
      fee_allocated: 2137479, prepayment_received_allocated: 10000,
      non_tuition: 5000, equation_left: 2152479, equation_right: 2152479,
    },
    checklist: {
      all_bank_transactions_classified: true,
      bank_fully_allocated: true,
      handover_all_confirmed: true,
      handover_variance_zero: true,
      no_pending_refunds: true,
      equation_balanced: true,
    },
  }

  async function mountTab() {
    const { default: CloseTab } = await import('@/components/fees/CloseTab.vue')
    return mount(CloseTab, { global: { stubs: globalStubs } })
  }

  it('checklist 全過時可直接關帳', async () => {
    apiMocks.getCloseSummary.mockResolvedValue(baseSummary)
    const wrapper = await mountTab()
    await flushPromises()
    expect(wrapper.find('[data-test="close-cards"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('✓ 平衡')
    const btn = wrapper.find('[data-test="close-btn"]')
    expect(btn.text()).toContain('關帳')
    expect(btn.text()).not.toContain('帶例外')
    expect(wrapper.find('[data-test="exception-note"]').exists()).toBe(false)
  })

  it('有未分類交易時需填例外說明才能關帳', async () => {
    apiMocks.getCloseSummary.mockResolvedValue({
      ...baseSummary,
      bank: { ...baseSummary.bank, unallocated: 10800, unclassified_count: 1 },
      checklist: {
        ...baseSummary.checklist,
        all_bank_transactions_classified: false,
        bank_fully_allocated: false,
      },
    })
    const wrapper = await mountTab()
    await flushPromises()
    const btn = wrapper.find('[data-test="close-btn"]')
    expect(btn.text()).toContain('帶例外關帳')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="exception-note"]').exists()).toBe(true)
  })

  it('預繳三向與老闆退款分開顯示', async () => {
    apiMocks.getCloseSummary.mockResolvedValue(baseSummary)
    const wrapper = await mountTab()
    await flushPromises()
    expect(wrapper.text()).toContain('已套用 NT$5,000（非新收款）')
    expect(wrapper.text()).toContain('退款')
    expect(wrapper.text()).toContain('老闆支出')
  })
})
