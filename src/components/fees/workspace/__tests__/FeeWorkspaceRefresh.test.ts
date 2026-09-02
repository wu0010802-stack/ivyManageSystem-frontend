/**
 * 跨工作區切回時的資料刷新（KeepAlive activate）。
 *
 * 學費頁四個工作區共用同一個 KeepAlive，切走的工作區會被 deactivate 但實例
 * 保留。原本只有工作台掛了 onActivated，於是「在入帳媒合銷帳完 → 切回應收帳款」
 * 看到的仍是分配前的舊快照，要手動改篩選或整頁重整才會更新；收款頁收現金會寫進
 * 當日交接批之後，結算工作區同樣需要在切回時取最新數字。
 *
 * 首次掛載不得重複載入（子元件自己 onMounted 會載一次），故以 mountedOnce
 * 旗標 gate，與 FeeWorkbench 既有作法一致。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getFeePeriods: vi.fn(),
  // useFeeOverview 的唯讀統計（本檔不驗待辦數）
  getCloseSummary: vi.fn(),
  getCashHandovers: vi.fn(),
  getFeeSummary: vi.fn(),
  getClosePeriods: vi.fn(),
  getBillSlipBatches: vi.fn(),
  getCollectionPayments: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }),
}))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

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
  __esModule: true,
  default: {
    name: 'FeeRecordsTab',
    props: {
      periodOptions: { type: Array, default: () => [] },
      classrooms: { type: Array, default: () => [] },
      defaultPeriod: { type: String, default: '' },
      initialSearch: { type: String, default: '' },
      autoLoad: { type: Boolean, default: false },
    },
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      expose({
        fetchRecords: recordsMocks.fetchRecords,
        applySearch: recordsMocks.applySearch,
      })
      return {}
    },
    template: '<div data-testid="records-tab" />',
  },
}))
vi.mock('@/components/fees/FeeRefundsTab.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeRefundsTab',
    props: ['periodOptions'],
    template: '<div data-testid="refunds-tab" />',
  },
}))
vi.mock('@/components/fees/FeeGenerateModal.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeGenerateModal',
    props: { modelValue: { type: Boolean, default: false } },
    template: '<div />',
  },
}))

const matchingMocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('../FeeMatchingPanel.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeMatchingPanel',
    props: { source: { type: String, default: 'collection' } },
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      expose({ refresh: matchingMocks.refresh })
      return {}
    },
    template: '<div data-testid="matching-panel" />',
  },
}))
vi.mock('../FeeBillSlipDrawer.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeBillSlipDrawer',
    props: { modelValue: { type: Boolean, default: false } },
    template: '<div />',
  },
}))

const handoverMocks = vi.hoisted(() => ({ fetchBatches: vi.fn() }))
vi.mock('@/components/fees/CashHandoverTab.vue', () => ({
  __esModule: true,
  default: {
    name: 'CashHandoverTab',
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      expose({ fetchBatches: handoverMocks.fetchBatches })
      return {}
    },
    template: '<div data-testid="handover-tab" />',
  },
}))

const closeMocks = vi.hoisted(() => ({ fetchSummary: vi.fn(), fetchCloses: vi.fn() }))
vi.mock('@/components/fees/CloseTab.vue', () => ({
  __esModule: true,
  default: {
    name: 'CloseTab',
    emits: ['navigate'],
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      expose({
        fetchSummary: closeMocks.fetchSummary,
        fetchCloses: closeMocks.fetchCloses,
      })
      return {}
    },
    template: '<div data-testid="close-tab" />',
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

/** 以 KeepAlive 包住受測工作區，`show` 切換即模擬切走／切回主工作區 */
function keepAliveHost(inner: unknown, extraProps: Record<string, unknown> = {}) {
  return defineComponent({
    components: { Inner: inner as never },
    props: { show: { type: Boolean, default: true } },
    setup: () => ({ extraProps }),
    template: '<KeepAlive><Inner v-if="show" v-bind="extraProps" /></KeepAlive>',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetFeeOverview()
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

describe('收款工作區切回時刷新', () => {
  it('首次掛載不額外呼叫刷新（子元件自載）', async () => {
    const wrapper = mount(keepAliveHost(FeeBillingWorkspace), {
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(statementMocks.refresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('切走再切回後刷新月表', async () => {
    const wrapper = mount(keepAliveHost(FeeBillingWorkspace), {
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()

    await wrapper.setProps({ show: false })
    await flushAll()
    await wrapper.setProps({ show: true })
    await flushAll()

    expect(statementMocks.refresh).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('停在逐筆明細時切回，刷新的是逐筆明細而非月表', async () => {
    const wrapper = mount(keepAliveHost(FeeBillingWorkspace), {
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    await wrapper.find('[data-test="records-mode-switch-list"]').trigger('click')
    await flushAll()

    await wrapper.setProps({ show: false })
    await flushAll()
    await wrapper.setProps({ show: true })
    await flushAll()

    expect(recordsMocks.fetchRecords).toHaveBeenCalledTimes(1)
    expect(statementMocks.refresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('停在入帳媒合時切回，刷新的是媒合面板', async () => {
    const wrapper = mount(keepAliveHost(FeeBillingWorkspace, { view: 'matching' }), {
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()

    await wrapper.setProps({ show: false })
    await flushAll()
    await wrapper.setProps({ show: true })
    await flushAll()

    expect(matchingMocks.refresh).toHaveBeenCalledTimes(1)
    expect(statementMocks.refresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('結算工作區切回時刷新', () => {
  it('首次掛載不額外呼叫刷新', async () => {
    const wrapper = mount(keepAliveHost(FeeSettlementWorkspace), {
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(handoverMocks.fetchBatches).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('切走再切回後刷新當日交接批（帳單頁收的現金會進當日批）', async () => {
    const wrapper = mount(keepAliveHost(FeeSettlementWorkspace), {
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()

    await wrapper.setProps({ show: false })
    await flushAll()
    await wrapper.setProps({ show: true })
    await flushAll()

    expect(handoverMocks.fetchBatches).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('停在月結時切回，重新取關帳摘要與關帳列表', async () => {
    const wrapper = mount(
      keepAliveHost(FeeSettlementWorkspace, { view: 'close' }),
      { global: { stubs: GLOBAL_STUBS } },
    )
    await flushAll()

    await wrapper.setProps({ show: false })
    await flushAll()
    await wrapper.setProps({ show: true })
    await flushAll()

    expect(closeMocks.fetchSummary).toHaveBeenCalledTimes(1)
    expect(closeMocks.fetchCloses).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
