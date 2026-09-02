/**
 * 月結（CloseTab）IA 改版行為：checklist 三態呈現與逐項「前往修正」入口。
 * （關帳按鈕 enable/disable 與帶例外流程在 FeeReconTabs.test.ts 既有覆蓋）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
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
  'el-input': { template: '<textarea v-bind="$attrs" />' },
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

import CloseTab from '@/components/fees/CloseTab.vue'

const SUMMARY = {
  bank: { credit_total: 100, unallocated: 50, unclassified_count: 1 },
  cash: {
    receipts_total: 0,
    handover_expected: 0,
    handover_actual: 0,
    handover_variance: 100,
    handover_unconfirmed: 1,
  },
  prepayment: { opening_balance: 0, received: 0, applied: 0, refunded: 0, closing_balance: 0 },
  owner: { refund_paid: 0, pending_refunds: 1 },
  totals: { fee_allocated: 0, non_tuition: 0, equation_left: 100, equation_right: 50 },
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
  it('未通過項目標示阻擋、已通過項目標示已通過', async () => {
    const wrapper = mountTab()
    await flushAll()
    const checklist = wrapper.find('[data-test="close-checklist"]')
    expect(checklist.text()).toContain('（未通過，阻擋直接關帳）')
    expect(checklist.text()).toContain('（已通過）')
  })

  it('未通過的檢查項排在最前（要處理的事不混在一長串已通過裡）', async () => {
    const wrapper = mountTab()
    await flushAll()
    const items = wrapper.findAll('[data-test="close-checklist"] li')
    const states = items.map((li) => li.text().includes('（未通過'))
    // 5 紅 1 綠：前 5 項都是未通過
    expect(states).toEqual([true, true, true, true, true, false])
    expect(wrapper.find('[data-test="close-failing-count"]').text()).toContain('5 項未通過')
  })

  it('摘要列取代五張卡，五格數字一格不少', async () => {
    const wrapper = mountTab()
    await flushAll()
    const cells = wrapper.findAll('[data-test="close-cards"] .close-cell')
    expect(cells).toHaveLength(5)
    expect(cells.map((c) => c.text())).toEqual(
      expect.arrayContaining([
        expect.stringContaining('銀行實際入帳'),
        expect.stringContaining('會計現金收款'),
        expect.stringContaining('學費分配'),
        expect.stringContaining('預繳款'),
        expect.stringContaining('預繳餘額'),
      ]),
    )
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
      [{ ws: 'billing', view: 'refunds' }],
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
