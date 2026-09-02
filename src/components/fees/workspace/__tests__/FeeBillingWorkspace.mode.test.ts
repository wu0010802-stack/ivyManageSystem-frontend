/**
 * 收款工作區「應收帳款」檢視模式切換：月表（預設）⇄ 逐筆明細。
 *
 * - 預設渲染 FeeMonthlyStatement（月繳總表）
 * - 模式切換渲染 FeeRecordsTab（auto-load 行為不變）
 * - 入帳媒合檢視改為代收／存摺來源切換（2026-09-02 IA 合併）
 * - 全域搜尋（studentSearch）落地逐筆明細並轉交 applySearch
 * - 月表 open-list（到逐筆明細處理）切換模式＋預帶姓名
 * - 切回應收帳款時刷新當前作用中的檢視
 *（產單為每日排程＋手動補產並行；產單按鈕/modal 行為由 FeeWorkspaces.test 覆蓋，
 * 本檔聚焦模式切換，modal 以 stub 隔離）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

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

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }),
}))

vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({
    classrooms: [],
    fetchClassrooms: vi.fn(),
  }),
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
    template:
      '<div data-testid="records-tab" :data-auto-load="autoLoad ? \'1\' : \'0\'" :data-initial-search="initialSearch" />',
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
    template: '<div />',
  },
}))
// 產單 modal stub：真元件會 import generateFeeRecords 與 currentRocYear，
// 本檔的 @/api/fees、@/utils/academic factory mock 未提供該兩個 export。
vi.mock('@/components/fees/FeeGenerateModal.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeGenerateModal',
    props: { modelValue: { type: Boolean, default: false } },
    template: '<div />',
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
import { __resetFeeOverview } from '../useFeeOverview'

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

describe('FeeBillingWorkspace 應收帳款模式切換', () => {
  it('預設渲染月表（月繳總表），非逐筆明細', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(false)
    const labels = wrapper
      .find('[data-test="records-mode-switch"]')
      .findAll('button')
      .map((b) => b.text())
    expect(labels).toEqual(['月表', '逐筆'])
  })

  it('切到逐筆明細渲染 FeeRecordsTab（auto-load），切回月表', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.find('[data-test="records-mode-switch-list"]').trigger('click')
    await flushAll()
    const records = wrapper.find('[data-testid="records-tab"]')
    expect(records.exists()).toBe(true)
    expect(records.attributes('data-auto-load')).toBe('1')
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(false)

    await wrapper.find('[data-test="records-mode-switch-statement"]').trigger('click')
    await flushAll()
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(true)
  })

  it('模式切換只在應收帳款檢視顯示（退款不顯示）', async () => {
    const wrapper = mount(FeeBillingWorkspace, {
      props: { view: 'refunds' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(wrapper.find('[data-test="records-mode-switch"]').exists()).toBe(false)
  })

  it('入帳媒合檢視改顯示來源切換（代收／存摺）', async () => {
    const wrapper = mount(FeeBillingWorkspace, {
      props: { view: 'matching' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(wrapper.find('[data-test="records-mode-switch"]').exists()).toBe(false)
    const labels = wrapper
      .find('[data-test="matching-source-switch"]')
      .findAll('button')
      .map((b) => b.text())
    expect(labels).toEqual(['代收明細', '存摺明細'])
    expect(wrapper.find('[data-testid="matching-panel"]').exists()).toBe(true)
  })

  it('切換入帳來源 emit change-source（由殼層寫回 query）', async () => {
    const wrapper = mount(FeeBillingWorkspace, {
      props: { view: 'matching', source: 'collection' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    await wrapper.find('[data-test="matching-source-switch-passbook"]').trigger('click')
    expect(wrapper.emitted('change-source')).toEqual([['passbook']])
  })

  it('全域搜尋（studentSearch）初始即落地逐筆明細並帶 initial-search', async () => {
    const wrapper = mount(FeeBillingWorkspace, {
      props: { studentSearch: '王小明' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    const records = wrapper.find('[data-testid="records-tab"]')
    expect(records.exists()).toBe(true)
    expect(records.attributes('data-initial-search')).toBe('王小明')
  })

  it('搜尋變更時切到逐筆明細並轉交 applySearch', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(true)
    await wrapper.setProps({ studentSearch: '陳小華' })
    await flushAll()
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(true)
    expect(recordsMocks.applySearch).toHaveBeenCalledWith('陳小華')
  })

  it('月表 open-list（到逐筆明細處理）切換模式並預帶姓名', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    wrapper.findComponent({ name: 'FeeMonthlyStatement' }).vm.$emit('open-list', '陳部分')
    await flushAll()
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(true)
    expect(recordsMocks.applySearch).toHaveBeenCalledWith('陳部分')
  })

  it('切回應收帳款檢視時刷新作用中的月表', async () => {
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
})
