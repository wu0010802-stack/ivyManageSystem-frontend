/**
 * 兩個包裝工作區的測試：收款（次層導航＝應收帳款/現金項目/入帳媒合/退款，
 * 2026-09-02 帳單＋對帳合併；預設學期）、結算（每日交接/月結切換＋navigate
 * 冒泡）。SPEC-019 起費用設定與依範本產單入口已全數退場。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getFeePeriods: vi.fn(),
  // useFeeOverview 的唯讀統計（待辦數本身由 useFeeOverview 自己的測試覆蓋）
  getCloseSummary: vi.fn(),
  getCashHandovers: vi.fn(),
  getFeeSummary: vi.fn(),
  getClosePeriods: vi.fn(),
  getBillSlipBatches: vi.fn(),
  getCollectionPayments: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

const authMocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => authMocks.perms.has(name),
}))

vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }),
}))

const storeMocks = vi.hoisted(() => ({ fetchClassrooms: vi.fn() }))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({
    classrooms: [],
    fetchClassrooms: storeMocks.fetchClassrooms,
  }),
}))

// ── 子分頁全部 stub ────────────────────────────────────────────────────────
const statementMocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/components/fees/FeeMonthlyStatement.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeMonthlyStatement',
    props: { classrooms: { type: Array, default: () => [] } },
    emits: ['open-list'],
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      expose({ refresh: statementMocks.refresh })
      return {}
    },
    template: '<div data-testid="monthly-statement" />',
  },
}))

const recordsMocks = vi.hoisted(() => ({
  fetchRecords: vi.fn(),
  applySearch: vi.fn(),
}))
vi.mock('@/components/fees/FeeRecordsTab.vue', () => ({
  default: {
    name: 'FeeRecordsTab',
    props: {
      periodOptions: { type: Array, default: () => [] },
      classrooms: { type: Array, default: () => [] },
      defaultPeriod: { type: String, default: '' },
      initialSearch: { type: String, default: '' },
      // Boolean 型宣告：無值 attribute（auto-load）才會轉為 true（同真實元件）
      autoLoad: { type: Boolean, default: false },
    },
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      expose({
        fetchRecords: recordsMocks.fetchRecords,
        applySearch: recordsMocks.applySearch,
      })
      return {}
    },
    template:
      '<div data-testid="records-tab" :data-default-period="defaultPeriod" :data-auto-load="autoLoad ? \'1\' : \'0\'" />',
  },
}))
vi.mock('@/components/fees/FeeRefundsTab.vue', () => ({
  default: {
    name: 'FeeRefundsTab',
    props: ['periodOptions'],
    template: '<div data-testid="refunds-tab" />',
  },
}))
const handoverMocks = vi.hoisted(() => ({
  fetchBatches: vi.fn(),
  openCashDialog: vi.fn(),
}))
vi.mock('@/components/fees/CashHandoverTab.vue', () => ({
  __esModule: true,
  default: {
    name: 'CashHandoverTab',
    props: { embedded: { type: Boolean, default: false } },
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      expose(handoverMocks)
      return {}
    },
    template: '<div data-testid="handover-tab" :data-embedded="embedded ? \'1\' : \'0\'" />',
  },
}))
const closeMocks = vi.hoisted(() => ({ fetchSummary: vi.fn() }))
vi.mock('@/components/fees/CloseTab.vue', async () => {
  const { ref } = await import('vue')
  return {
    __esModule: true,
    default: {
      name: 'CloseTab',
      emits: ['navigate'],
      setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
        const month = ref('2026-08')
        expose({
          ...closeMocks,
          month,
          setMonth: (next: string) => {
            month.value = next
            closeMocks.fetchSummary()
          },
        })
        return { month }
      },
      template:
        '<div data-testid="close-tab" :data-month="month"><button data-testid="fake-fix" @click="$emit(\'navigate\', { ws: \'billing\', view: \'matching\' })" /></div>',
    },
  }
})
vi.mock('../FeeMatchingPanel.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeMatchingPanel',
    props: { source: { type: String, default: 'collection' } },
    template: '<div data-testid="matching-panel" :data-source="source" />',
  },
}))
vi.mock('../FeeBillSlipDrawer.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeBillSlipDrawer',
    props: { modelValue: { type: Boolean, default: false } },
    template: '<div data-testid="billslip-drawer" v-if="modelValue" />',
  },
}))

const GLOBAL_STUBS = {
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-skeleton': { template: '<div data-testid="skeleton" />' },
  'el-popover': { template: '<div><slot name="reference" /></div>' },
  'el-dropdown': { template: '<div><slot /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div><slot /></div>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-date-picker': {
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template:
      '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}

const flushAll = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import FeeBillingWorkspace from '../FeeBillingWorkspace.vue'
import FeeSettlementWorkspace from '../FeeSettlementWorkspace.vue'
import { __resetFeeOverview } from '../useFeeOverview'

beforeEach(() => {
  vi.clearAllMocks()
  __resetFeeOverview()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
  apiMocks.getFeePeriods.mockResolvedValue(['115-1', '114-2'])
  apiMocks.getCloseSummary.mockRejectedValue(new Error('n/a'))
  apiMocks.getCashHandovers.mockResolvedValue({ items: [] })
  apiMocks.getFeeSummary.mockResolvedValue({
    total_count: 0,
    unpaid_count: 0,
    partial_count: 0,
    total_unpaid: 0,
  })
  apiMocks.getClosePeriods.mockResolvedValue({ items: [] })
  apiMocks.getBillSlipBatches.mockResolvedValue([])
  apiMocks.getCollectionPayments.mockResolvedValue({ total: 0 })
})

describe('FeeBillingWorkspace（收款）', () => {
  it('次層導航為應收帳款/現金項目/入帳媒合/退款，預設應收帳款＝月表', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    const labels = wrapper
      .find('[data-test="billing-view"]')
      .findAll('button')
      .map((b) => b.text().replace(/\s+/g, ''))
    expect(labels).toEqual(['應收帳款', '現金項目', '入帳媒合', '退款'])
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(false)
  })

  it('view=matching 渲染入帳媒合面板並下傳來源', async () => {
    const wrapper = mount(FeeBillingWorkspace, {
      props: { view: 'matching', source: 'passbook' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    const panel = wrapper.find('[data-testid="matching-panel"]')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('data-source')).toBe('passbook')
  })

  it('切到逐筆明細模式時帶入當前學期（autoLoad 自載，行為不變）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.find('[data-test="records-mode-switch-list"]').trigger('click')
    await flushAll()
    const records = wrapper.find('[data-testid="records-tab"]')
    expect(records.exists()).toBe(true)
    expect(records.attributes('data-default-period')).toBe('115-1')
    expect(records.attributes('data-auto-load')).toBe('1')
  })

  it('切換次層檢視 emit change-view（由殼層寫回 query）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.find('[data-test="billing-view-refunds"]').trigger('click')
    expect(wrapper.emitted('change-view')).toEqual([['refunds']])
  })

  it('view=refunds 渲染退款分頁（預繳無獨立分頁）', async () => {
    const refunds = mount(FeeBillingWorkspace, {
      props: { view: 'refunds' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(refunds.find('[data-testid="refunds-tab"]').exists()).toBe(true)
    expect(refunds.find('[data-testid="monthly-statement"]').exists()).toBe(false)
    expect(refunds.find('[data-testid="prepayments-tab"]').exists()).toBe(false)
  })

  it('工具列不再有「產生費用單」（SPEC-019：應收唯一來源＝發單批次／現金項目）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    expect(wrapper.find('[data-test="billing-generate"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'FeeGenerateModal' }).exists()).toBe(false)
  })

  it('切回應收帳款檢視時刷新作用中的檢視（預設＝月表）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    statementMocks.refresh.mockClear()
    await wrapper.setProps({ view: 'refunds' })
    await flushAll()
    expect(statementMocks.refresh).not.toHaveBeenCalled()
    await wrapper.setProps({ view: 'receivable' })
    await flushAll()
    expect(statementMocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('學期列表只載入一次（次層切換不重複請求）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.setProps({ view: 'refunds' })
    await flushAll()
    await wrapper.setProps({ view: 'receivable' })
    await flushAll()
    expect(apiMocks.getFeePeriods).toHaveBeenCalledTimes(1)
    expect(storeMocks.fetchClassrooms).toHaveBeenCalledTimes(1)
  })
})

describe('FeeSettlementWorkspace（結算）', () => {
  it('次層導航為每日交接/月結，預設每日交接', async () => {
    const wrapper = mount(FeeSettlementWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    const labels = wrapper
      .find('[data-test="settlement-view"]')
      .findAll('button')
      .map((b) => b.text().replace(/\s+/g, ''))
    expect(labels).toEqual(['每日交接', '月結'])
    expect(wrapper.find('[data-testid="handover-tab"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="close-tab"]').exists()).toBe(false)
  })

  it('切到月結渲染 CloseTab，且修正入口 navigate 事件向上冒泡', async () => {
    const wrapper = mount(FeeSettlementWorkspace, {
      props: { view: 'close' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(wrapper.find('[data-testid="close-tab"]').exists()).toBe(true)
    await wrapper.find('[data-testid="fake-fix"]').trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([[{ ws: 'billing', view: 'matching' }]])
  })

  it('切換次層檢視 emit change-view', async () => {
    const wrapper = mount(FeeSettlementWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.find('[data-test="settlement-view-close"]').trigger('click')
    expect(wrapper.emitted('change-view')).toEqual([['close']])
  })

  it('每日交接的動作上移到共用工具列（子元件以 embedded 掛載）', async () => {
    const wrapper = mount(FeeSettlementWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    expect(wrapper.find('[data-testid="handover-tab"]').attributes('data-embedded')).toBe(
      '1',
    )
    await wrapper.find('[data-test="handover-open-cash"]').trigger('click')
    expect(handoverMocks.openCashDialog).toHaveBeenCalledTimes(1)
    await wrapper.find('[data-test="handover-refresh"]').trigger('click')
    expect(handoverMocks.fetchBatches).toHaveBeenCalledTimes(1)
  })

  it('月結的月份選擇與重算上移到共用工具列', async () => {
    const wrapper = mount(FeeSettlementWorkspace, {
      props: { view: 'close' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    const picker = wrapper.find('[data-test="close-month"]')
    expect((picker.element as HTMLInputElement).value).toBe('2026-08')

    await picker.setValue('2026-07')
    await flushAll()
    expect(wrapper.find('[data-testid="close-tab"]').attributes('data-month')).toBe(
      '2026-07',
    )
    expect(closeMocks.fetchSummary).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-test="close-recalc"]').trigger('click')
    expect(closeMocks.fetchSummary).toHaveBeenCalledTimes(2)
  })

  it('無 FEES_WRITE 時工具列不顯示「登記現金收款」', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const wrapper = mount(FeeSettlementWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    expect(wrapper.find('[data-test="handover-open-cash"]').exists()).toBe(false)
  })
})
