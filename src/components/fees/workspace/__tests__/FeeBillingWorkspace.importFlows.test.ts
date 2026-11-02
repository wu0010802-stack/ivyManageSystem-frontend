/**
 * 收款工作區工具列「匯入 ▾」與發單抽屜的跨元件流程（2026-11-02 bug hunt）。
 *
 * F5：「匯入 ▾ › 代收／存摺 CSV」要切到入帳媒合對應來源並展開匯入面板。
 *     view／source 是 route query 受控 prop，本元件只 emit，寫回要等殼層完成
 *     一次 router 導覽（遠超兩個 microtask）。舊版 await 兩次 nextTick 就呼叫
 *     matchingRef.openImport，此時面板根本還沒掛載 → staging 實測面板不展開。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, inject, nextTick, provide } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getFeePeriods: vi.fn(),
  getCloseSummary: vi.fn(),
  getCashHandovers: vi.fn(),
  getFeeSummary: vi.fn(),
  getClosePeriods: vi.fn(),
  getBillSlipBatches: vi.fn(),
  getCollectionPayments: vi.fn(),
  getBankTransactions: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }),
}))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

vi.mock('@/components/fees/FeeMonthlyStatement.vue', () => ({
  __esModule: true,
  default: { name: 'FeeMonthlyStatement', template: '<div data-testid="monthly-statement" />' },
}))
vi.mock('@/components/fees/FeeRecordsTab.vue', () => ({
  __esModule: true,
  default: { name: 'FeeRecordsTab', template: '<div data-testid="records-tab" />' },
}))
vi.mock('@/components/fees/FeeRefundsTab.vue', () => ({
  __esModule: true,
  default: { name: 'FeeRefundsTab', template: '<div data-testid="refunds-tab" />' },
}))
vi.mock('@/components/fees/CashItemsView.vue', () => ({
  __esModule: true,
  default: { name: 'CashItemsView', template: '<div data-testid="cash-items" />' },
}))

/** 媒合面板：openImport 記下當下的來源，驗「展開的是對的那個來源」 */
const matchingMocks = vi.hoisted(() => ({ openImport: vi.fn(), refresh: vi.fn() }))
vi.mock('../FeeMatchingPanel.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeMatchingPanel',
    props: { source: { type: String, default: 'collection' } },
    setup(
      props: { source: string },
      { expose }: { expose: (o: Record<string, unknown>) => void },
    ) {
      expose({
        openImport: () => matchingMocks.openImport(props.source),
        refresh: matchingMocks.refresh,
      })
      return {}
    },
    template: '<div data-testid="matching-panel" :data-source="source" />',
  },
}))
vi.mock('../FeeBillSlipDrawer.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeBillSlipDrawer',
    props: { modelValue: { type: Boolean, default: false } },
    emits: ['update:modelValue', 'generated', 'batches-changed'],
    template: '<div data-testid="billslip-drawer" />',
  },
}))
vi.mock('../FeeSlipTemplateDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeSlipTemplateDialog',
    props: ['modelValue', 'kind', 'defaultYear', 'defaultMonth'],
    template: '<div />',
  },
}))

// el-dropdown：讓 dropdown-item 可點、點了以 command 事件回拋（同 Element Plus）
const DROPDOWN = Symbol('dropdown')
const ElDropdownStub = defineComponent({
  emits: ['command'],
  setup(_props, { slots, emit }) {
    provide(DROPDOWN, (command: string) => emit('command', command))
    return () => h('div', [slots.default?.(), slots.dropdown?.()])
  },
})
const ElDropdownItemStub = defineComponent({
  props: { command: { type: String, default: '' } },
  setup(props, { slots, attrs }) {
    const fire = inject<(command: string) => void>(DROPDOWN, () => undefined)
    return () =>
      h('button', { ...attrs, type: 'button', onClick: () => fire(props.command) }, slots.default?.())
  },
})

const GLOBAL_STUBS = {
  ManualFeeRecordDialog: { props: ['modelValue'], template: '<div />' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-skeleton': { template: '<div />' },
  'el-popover': { template: '<div><slot name="reference" /></div>' },
  'el-dropdown': ElDropdownStub,
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': ElDropdownItemStub,
  'el-icon': { template: '<i><slot /></i>' },
}

/** router 導覽是 macrotask 等級的往返（導覽守衛＋history API），不是一兩個 microtask */
const ROUTER_DELAY_MS = 5
const settle = async (ms = ROUTER_DELAY_MS * 4) => {
  await new Promise((resolve) => setTimeout(resolve, ms))
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import FeeBillingWorkspace from '../FeeBillingWorkspace.vue'
import { __resetFeeOverview } from '../useFeeOverview'

/** 扮演殼層：change-view／change-source 延遲一個 router 往返才寫回 prop */
function mountBilling(props: Record<string, unknown> = {}) {
  let wrapper: ReturnType<typeof mount>
  const later = (patch: Record<string, unknown>) => {
    setTimeout(() => void wrapper.setProps(patch), ROUTER_DELAY_MS)
  }
  wrapper = mount(FeeBillingWorkspace, {
    props: {
      view: 'receivable',
      source: 'collection',
      ...props,
      'onChange-view': (view: string) => later({ view }),
      'onChange-source': (source: string) => later({ source }),
    },
    global: { stubs: GLOBAL_STUBS },
  })
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetFeeOverview()
  apiMocks.getFeePeriods.mockResolvedValue(['115-1'])
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
  apiMocks.getBankTransactions.mockResolvedValue({ total: 0 })
})

describe('F5「匯入 ▾ › 代收／存摺 CSV」：等媒合面板真的掛上才展開匯入面板', () => {
  it('存摺 CSV：router 往返後切到存摺來源，並展開存摺的匯入面板一次', async () => {
    const wrapper = mountBilling()
    await settle()
    await wrapper.get('[data-test="import-passbook"]').trigger('click')
    await settle()
    expect(wrapper.find('[data-testid="matching-panel"]').attributes('data-source')).toBe('passbook')
    expect(matchingMocks.openImport).toHaveBeenCalledTimes(1)
    expect(matchingMocks.openImport).toHaveBeenCalledWith('passbook')
    wrapper.unmount()
  })

  it('代收 CSV（來源已是預設代收）：只切檢視，掛上後展開代收匯入面板', async () => {
    const wrapper = mountBilling()
    await settle()
    await wrapper.get('[data-test="import-collection"]').trigger('click')
    await settle()
    expect(matchingMocks.openImport).toHaveBeenCalledTimes(1)
    expect(matchingMocks.openImport).toHaveBeenCalledWith('collection')
    wrapper.unmount()
  })

  it('一次性：展開後再切來源來回，不會又自己打開匯入面板', async () => {
    const wrapper = mountBilling()
    await settle()
    await wrapper.get('[data-test="import-passbook"]').trigger('click')
    await settle()
    await wrapper.setProps({ source: 'collection' })
    await settle()
    await wrapper.setProps({ source: 'passbook' })
    await settle()
    expect(matchingMocks.openImport).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('導覽途中被帶去別的檢視：意圖作廢，之後手動進媒合不會突然展開匯入', async () => {
    const wrapper = mount(FeeBillingWorkspace, {
      props: { view: 'receivable', source: 'collection' },
      global: { stubs: GLOBAL_STUBS },
    })
    await settle()
    await wrapper.get('[data-test="import-passbook"]').trigger('click')
    // 殼層沒有照 emit 走，而是被帶去退款（例如使用者立刻點了別的頁籤）
    await wrapper.setProps({ view: 'refunds' })
    await settle()
    await wrapper.setProps({ view: 'matching', source: 'passbook' })
    await settle()
    expect(matchingMocks.openImport).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
