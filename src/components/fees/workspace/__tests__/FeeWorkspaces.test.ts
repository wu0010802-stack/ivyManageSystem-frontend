/**
 * 三個包裝工作區的測試：帳單（次層導航＋預設學期；產單已改每日排程自動化，
 * header 不再有「產生費用單」）、結算（每日交接/月結切換＋navigate 冒泡）、
 * 費用設定（範本/銷帳碼切換）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getFeePeriods: vi.fn(),
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
vi.mock('@/components/fees/PrepaymentsTab.vue', () => ({
  default: { name: 'PrepaymentsTab', template: '<div data-testid="prepayments-tab" />' },
}))
vi.mock('@/components/fees/FeeRefundsTab.vue', () => ({
  default: {
    name: 'FeeRefundsTab',
    props: ['periodOptions'],
    template: '<div data-testid="refunds-tab" />',
  },
}))
vi.mock('@/components/fees/CashHandoverTab.vue', () => ({
  default: { name: 'CashHandoverTab', template: '<div data-testid="handover-tab" />' },
}))
vi.mock('@/components/fees/CloseTab.vue', () => ({
  default: {
    name: 'CloseTab',
    emits: ['navigate'],
    template:
      '<div data-testid="close-tab"><button data-testid="fake-fix" @click="$emit(\'navigate\', { ws: \'recon\' })" /></div>',
  },
}))
vi.mock('@/components/fees/FeeTemplateTab.vue', () => ({
  default: { name: 'FeeTemplateTab', template: '<div data-testid="templates-tab" />' },
}))
vi.mock('@/components/fees/BillingCodesTab.vue', () => ({
  default: { name: 'BillingCodesTab', template: '<div data-testid="billing-codes-tab" />' },
}))

const ElSegmentedStub = {
  name: 'ElSegmented',
  props: ['modelValue', 'options'],
  emits: ['change'],
  template: `
    <div>
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        :data-seg="o.value"
        @click="$emit('change', o.value)"
      >{{ o.label }}</button>
    </div>
  `,
}

const GLOBAL_STUBS = {
  'el-segmented': ElSegmentedStub,
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-skeleton': { template: '<div data-testid="skeleton" />' },
}

const flushAll = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import FeeBillingWorkspace from '../FeeBillingWorkspace.vue'
import FeeSettlementWorkspace from '../FeeSettlementWorkspace.vue'
import FeeSettingsWorkspace from '../FeeSettingsWorkspace.vue'

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
  apiMocks.getFeePeriods.mockResolvedValue(['115-1', '114-2'])
})

describe('FeeBillingWorkspace（帳單）', () => {
  it('次層導航為帳款/預繳/退款，預設顯示帳款＝彙總繳費表（2026-08 改版）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    const labels = wrapper
      .find('[data-test="billing-view-switch"]')
      .findAll('button')
      .map((b) => b.text())
    expect(labels).toEqual(['帳款', '預繳', '退款'])
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(false)
  })

  it('切到逐筆明細模式時帶入當前學期（autoLoad 自載，行為不變）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.find('[data-seg="list"]').trigger('click')
    await flushAll()
    const records = wrapper.find('[data-testid="records-tab"]')
    expect(records.exists()).toBe(true)
    expect(records.attributes('data-default-period')).toBe('115-1')
    expect(records.attributes('data-auto-load')).toBe('1')
  })

  it('切換次層檢視 emit change-view（由殼層寫回 query）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.find('[data-seg="prepayments"]').trigger('click')
    expect(wrapper.emitted('change-view')).toEqual([['prepayments']])
  })

  it('view=prepayments / refunds 各自渲染對應分頁', async () => {
    const prepay = mount(FeeBillingWorkspace, {
      props: { view: 'prepayments' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(prepay.find('[data-testid="prepayments-tab"]').exists()).toBe(true)
    expect(prepay.find('[data-testid="records-tab"]').exists()).toBe(false)

    const refunds = mount(FeeBillingWorkspace, {
      props: { view: 'refunds' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(refunds.find('[data-testid="refunds-tab"]').exists()).toBe(true)
  })

  it('header 不再有「產生費用單」按鈕（產單改每日排程自動化，具 FEES_WRITE 亦然）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    expect(wrapper.find('[data-test="billing-generate"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('產生費用單')
  })

  it('切回帳款檢視時刷新作用中的檢視（預設＝彙總繳費表）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    statementMocks.refresh.mockClear()
    await wrapper.setProps({ view: 'prepayments' })
    await flushAll()
    expect(statementMocks.refresh).not.toHaveBeenCalled()
    await wrapper.setProps({ view: 'records' })
    await flushAll()
    expect(statementMocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('學期列表只載入一次（次層切換不重複請求）', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.setProps({ view: 'prepayments' })
    await flushAll()
    await wrapper.setProps({ view: 'records' })
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
      .find('[data-test="settlement-view-switch"]')
      .findAll('button')
      .map((b) => b.text())
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
    expect(wrapper.emitted('navigate')).toEqual([[{ ws: 'recon' }]])
  })

  it('切換次層檢視 emit change-view', async () => {
    const wrapper = mount(FeeSettlementWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.find('[data-seg="close"]').trigger('click')
    expect(wrapper.emitted('change-view')).toEqual([['close']])
  })
})

describe('FeeSettingsWorkspace（費用設定）', () => {
  it('分頁為費用範本/銷帳碼，預設範本', async () => {
    const wrapper = mount(FeeSettingsWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    const labels = wrapper
      .find('[data-test="settings-view-switch"]')
      .findAll('button')
      .map((b) => b.text())
    expect(labels).toEqual(['費用範本', '銷帳碼'])
    expect(wrapper.find('[data-testid="templates-tab"]').exists()).toBe(true)
  })

  it('view=billingCodes 渲染銷帳碼分頁；切換 emit change-view', async () => {
    const wrapper = mount(FeeSettingsWorkspace, {
      props: { view: 'billingCodes' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(wrapper.find('[data-testid="billing-codes-tab"]').exists()).toBe(true)
    await wrapper.find('[data-seg="templates"]').trigger('click')
    expect(wrapper.emitted('change-view')).toEqual([['templates']])
  })
})
