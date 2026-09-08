/**
 * 月結（CloseTab）待辦優先、收合區塊與例外關帳的可觀察行為。
 * （關帳按鈕 enable/disable 與帶例外流程在 FeeReconTabs.test.ts 既有覆蓋）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getCloseSummary: vi.fn(),
  getClosePeriods: vi.fn<() => Promise<{ total: number; items: unknown[] }>>(() => Promise.resolve({ total: 0, items: [] })),
  closePeriod: vi.fn(),
  reopenClosePeriod: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

const authMocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => authMocks.perms.has(name),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, props.data.length ? [slots.default?.()] : [])
  },
})

const GLOBAL_STUBS = {
  'el-table': ElTableStub,
  'el-table-column': { template: '<span />' },
  'el-card': { template: '<div><slot /></div>' },
  'el-alert': { template: '<div v-bind="$attrs"><slot /></div>' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: `<textarea :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" v-bind="$attrs" />` },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<i aria-hidden="true"><slot /></i>' },
}

const flushAll = async () => {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import { ElMessageBox } from 'element-plus'
import CloseTab from '@/components/fees/CloseTab.vue'

const SUMMARY = {
  bank: { credit_total: 100, unallocated: 50, unclassified_count: 1, ignored_amount: 5 },
  collection: { gross_total: 1200, net_total: 1180, fee_total: 20, unallocated: 40 },
  cash: {
    receipts_total: 0,
    handover_expected: 0,
    handover_actual: 0,
    handover_variance: 100,
    handover_unconfirmed: 1,
  },
  prepayment: { opening_balance: 0, received: 0, applied: 0, refunded: 0, closing_balance: 0 },
  owner: { refund_paid: 0, pending_refunds: 1 },
  totals: { prepayment_received_allocated: 75, fee_allocated: 0, non_tuition: 0, equation_left: 100, equation_right: 50 },
  checklist: {
    all_bank_transactions_classified: false,
    bank_fully_allocated: false,
    handover_all_confirmed: true,
    handover_variance_zero: false,
    no_pending_refunds: false,
    equation_balanced: false,
  },
}

function mountTab() {
  return mount(CloseTab, {
    global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE', 'FEE_CLOSE_APPROVE'])
  apiMocks.getCloseSummary.mockResolvedValue(SUMMARY)
})

describe('CloseTab 阻擋項目與修正入口', () => {
  it('待處理先呈現、已通過檢查與歷史預設收合', async () => {
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.get('[data-test="close-status"]').text()).toContain('尚不可直接關帳・5 項待處理')
    expect(wrapper.findAll('[data-test="close-checklist"] li')).toHaveLength(5)
    expect(wrapper.get('[data-test="passed-checks"]').attributes('open')).toBeUndefined()
    expect(wrapper.get('[data-test="passed-checks"] summary').text()).toContain('已通過 1 項檢查')
    expect(wrapper.get('[data-test="history-detail"]').attributes('open')).toBeUndefined()
    expect(wrapper.text()).toContain('尚無關帳紀錄，完成關帳後會保留當時的檢查結果與快照')
  })

  it('代收未分配金額直接出現在待處理列，收款摘要位於待辦之後', async () => {
    apiMocks.getCloseSummary.mockResolvedValue({ ...SUMMARY, checklist: { ...SUMMARY.checklist, collection_fully_allocated: false } })
    const wrapper = mountTab()
    await flushAll()
    const row = wrapper.get('[data-test="close-fix-collection_fully_allocated"]').element.closest('li')!
    expect(row.textContent).toContain('未分配 NT$40')
    expect(row.textContent).toContain('處理代收分配')
    expect(wrapper.html().indexOf('data-test="close-checklist"')).toBeLessThan(wrapper.html().indexOf('data-test="close-cards"'))
    expect(wrapper.get('[data-test="prepayment-detail"]').attributes('open')).toBeUndefined()
    expect(wrapper.text()).not.toContain('roll-forward')
  })

  it('例外需主動展開，確認列出未通過檢查並保留快照差異標記', async () => {
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.get('[data-test="close-btn"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="exception-note"]').exists()).toBe(false)
    await wrapper.get('[data-test="exception-toggle"]').trigger('click')
    expect(wrapper.get('[data-test="exception-close-btn"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="exception-note"]').setValue('測試例外說明')
    await wrapper.get('[data-test="exception-close-btn"]').trigger('click')
    await flushAll()
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.stringContaining('銀行入帳已全額分配'), '確認帶例外關帳', expect.anything())
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.stringContaining('快照會標記有差異'), expect.anything(), expect.anything())
    expect(apiMocks.closePeriod).toHaveBeenCalledWith(expect.objectContaining({ exception_note: '測試例外說明' }))
    expect(wrapper.find('[data-test="exception-note"]').exists()).toBe(false)
  })

  it('切換月份清空例外模式與說明', async () => {
    const wrapper = mountTab()
    await flushAll()
    await wrapper.get('[data-test="exception-toggle"]').trigger('click')
    await wrapper.get('[data-test="exception-note"]').setValue('前月說明')
    wrapper.vm.setMonth('2027-09')
    await flushAll()
    expect(wrapper.find('[data-test="exception-note"]').exists()).toBe(false)
    await wrapper.get('[data-test="exception-toggle"]').trigger('click')
    expect(wrapper.get<HTMLTextAreaElement>('[data-test="exception-note"]').element.value).toBe('')
  })

  it('關帳紀錄載入失敗時不允許送出，重新載入後恢復', async () => {
    apiMocks.getClosePeriods.mockRejectedValueOnce(new Error('測試紀錄讀取失敗'))
    apiMocks.getCloseSummary.mockResolvedValue({ ...SUMMARY, checklist: { equation_balanced: true } })
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.get('[data-test="close-btn"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('尚未確認關帳紀錄')
    await wrapper.vm.fetchCloses()
    await flushAll()
    expect(wrapper.get('[data-test="close-btn"]').attributes('disabled')).toBeUndefined()
  })

  it('確認對話框期間切換月份不得送出前月關帳', async () => {
    let confirm!: () => void
    vi.mocked(ElMessageBox.confirm).mockImplementationOnce(() => new Promise((resolve) => { confirm = () => resolve('confirm') }))
    apiMocks.getCloseSummary.mockResolvedValue({ ...SUMMARY, checklist: { equation_balanced: true } })
    const wrapper = mountTab()
    await flushAll()
    await wrapper.get('[data-test="close-btn"]').trigger('click')
    wrapper.vm.setMonth('2027-09')
    await flushAll()
    confirm()
    await flushAll()
    expect(apiMocks.closePeriod).not.toHaveBeenCalled()
  })

  it('已關帳月份不再提供關帳按鈕', async () => {
    apiMocks.getClosePeriods.mockResolvedValueOnce({ total: 1, items: [{ close_year: 2027, close_month: 9, status: 'closed' }] })
    const wrapper = mountTab()
    wrapper.vm.setMonth('2027-09')
    await flushAll()
    expect(wrapper.get('[data-test="close-status"]').text()).toContain('已關帳')
    expect(wrapper.find('[data-test="close-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="exception-toggle"]').exists()).toBe(false)
  })

  it('重開成功但紀錄刷新失敗時不得沿用已關帳狀態', async () => {
    const row = { id: 9, close_year: 2027, close_month: 9, status: 'closed', closed_at: '2027-09-30T10:00:00', has_exceptions: false, exception_note: null }
    apiMocks.getClosePeriods.mockResolvedValueOnce({ total: 1, items: [row] })
    apiMocks.getCloseSummary.mockResolvedValue({ ...SUMMARY, checklist: { equation_balanced: true } })
    vi.mocked(ElMessageBox.prompt).mockResolvedValueOnce({ value: '測試重開原因', action: 'confirm' })
    apiMocks.reopenClosePeriod.mockResolvedValueOnce({ ...row, status: 'reopened' })
    const wrapper = mount(CloseTab, {
      global: { stubs: { ...GLOBAL_STUBS, 'el-table-column': { setup: () => ({ row }), template: '<div><slot :row="row" /></div>' } } },
    })
    wrapper.vm.setMonth('2027-09')
    await flushAll()
    expect(wrapper.get('[data-test="close-status"]').text()).toContain('已關帳')
    apiMocks.getClosePeriods.mockRejectedValueOnce(new Error('測試刷新失敗'))
    await wrapper.get('[aria-label="重開此月份關帳"]').trigger('click')
    await flushAll()
    expect(apiMocks.reopenClosePeriod).toHaveBeenCalledWith(9, { reason: '測試重開原因' })
    expect(wrapper.get('[data-test="close-status"]').text()).toContain('尚未確認關帳狀態')
    expect(wrapper.find('[data-test="close-history"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="close-btn"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('尚未確認關帳紀錄')
  })

  it('唯讀人員也看得到關帳紀錄無法確認的提示', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    apiMocks.getClosePeriods.mockRejectedValueOnce(new Error('測試紀錄讀取失敗'))
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.text()).toContain('尚未確認關帳紀錄')
    expect(wrapper.find('[data-test="close-btn"]').exists()).toBe(false)
  })

  it('月份選擇與重算不再自帶一列（已上移到結算工具列）', async () => {
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.find('.close-tab > .toolbar').exists()).toBe(false)
  })

  it('顯示未通過數量的阻擋說明', async () => {
    const wrapper = mountTab()
    await flushAll()
    const hint = wrapper.find('[data-test="close-blocked-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('5 項檢查未通過')
  })

  it('每個未通過項目提供對應工作區的修正入口（emit navigate）', async () => {
    const wrapper = mountTab()
    await flushAll()
    // 已通過項目不出現修正入口
    expect(wrapper.find('[data-test="close-fix-handover_all_confirmed"]').exists()).toBe(false)

    await wrapper
      .find('[data-test="close-fix-all_bank_transactions_classified"]')
      .trigger('click')
    await wrapper.find('[data-test="close-fix-handover_variance_zero"]').trigger('click')
    await wrapper.find('[data-test="close-fix-no_pending_refunds"]').trigger('click')
    // 2026-09-02 IA：對帳併入收款，存摺分類落在收款／入帳媒合（存摺來源）
    expect(wrapper.emitted('navigate')).toEqual([
      [{ ws: 'billing', view: 'matching', src: 'passbook' }],
      [{ ws: 'settlement', view: 'handover' }],
      [{ ws: 'billing', view: 'cashItems' }],
    ])
  })

  it('checklist 全通過時無阻擋說明、無修正入口', async () => {
    apiMocks.getCloseSummary.mockResolvedValue({
      ...SUMMARY,
      checklist: Object.fromEntries(
        Object.keys(SUMMARY.checklist).map((k) => [k, true]),
      ),
    })
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.find('[data-test="close-blocked-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-test^="close-fix-"]').exists()).toBe(false)
  })
})


describe('月結試算競態', () => {
  it('舊月份晚回應不可覆蓋新月份摘要', async () => {
    let resolveOld!: (value: typeof SUMMARY) => void
    apiMocks.getCloseSummary.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const wrapper = mountTab()
    const newer = { ...SUMMARY, bank: { ...SUMMARY.bank, credit_total: 999 } }
    apiMocks.getCloseSummary.mockResolvedValueOnce(newer)
    wrapper.vm.setMonth('2027-09')
    await flushAll()
    resolveOld(SUMMARY)
    await flushAll()
    expect(wrapper.get('[data-test="close-cards"]').text()).toContain('999')
  })

  it('新月份讀取中及失敗後不保留舊摘要與關帳按鈕', async () => {
    const wrapper = mountTab()
    await flushAll()
    let rejectNew!: (reason: Error) => void
    apiMocks.getCloseSummary.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectNew = reject }))
    wrapper.vm.setMonth('2027-09')
    await nextTick()
    expect(wrapper.find('[data-test="close-cards"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="close-btn"]').exists()).toBe(false)
    rejectNew(new Error('測試載入失敗'))
    await flushAll()
    expect(wrapper.find('[data-test="close-cards"]').exists()).toBe(false)
  })
})

it('完整說明代收毛額、日期口徑與等式分配項，平衡仍依後端判定', async () => {
  const wrapper = mountTab()
  await flushAll()
  const collection = wrapper.get('[data-test="close-collection"]')
  expect(collection.text()).toContain('NT$1,200')
  expect(collection.text()).toContain('家長繳費日')
  expect(collection.text()).toContain('尚未撥款')
  const details = wrapper.get('[data-test="equation-detail"]')
  expect(details.text()).toContain('新收預繳分配 NT$75')
  expect(details.text()).toContain('存摺標記非學費 NT$5')
  expect(details.text()).toContain('代收未分配 NT$40')
  expect(wrapper.get('[data-test="equation-alert"]').text()).toContain('不平衡')
  expect(wrapper.text()).toContain('不代表每筆款項均已媒合')
  wrapper.unmount()
})
