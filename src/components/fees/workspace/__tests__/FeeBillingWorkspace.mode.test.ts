/**
 * 帳單工作區「帳款」檢視模式切換：彙總繳費表（預設）⇄ 逐筆明細。
 *
 * - 預設渲染 FeeMonthlyStatement（月繳總表）
 * - 模式切換渲染 FeeRecordsTab（auto-load 行為不變）
 * - 全域搜尋（studentSearch）落地逐筆明細並轉交 applySearch
 * - 彙總表 open-list（到逐筆明細處理）切換模式＋預帶姓名
 * - 切回帳款時刷新當前作用中的檢視
 *（產單已改每日排程自動化，本工作區不再有產單 modal 與其刷新路徑）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getFeePeriods: vi.fn(),
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
vi.mock('@/components/fees/PrepaymentsTab.vue', () => ({
  __esModule: true,
  default: { name: 'PrepaymentsTab', template: '<div data-testid="prepayments-tab" />' },
}))
vi.mock('@/components/fees/FeeRefundsTab.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeRefundsTab',
    props: ['periodOptions'],
    template: '<div data-testid="refunds-tab" />',
  },
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

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.getFeePeriods.mockResolvedValue(['115-1', '114-2'])
})

describe('FeeBillingWorkspace 帳款模式切換', () => {
  it('預設渲染彙總繳費表（月繳總表），非逐筆明細', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(false)
    const labels = wrapper
      .find('[data-test="records-mode-switch"]')
      .findAll('button')
      .map((b) => b.text())
    expect(labels).toEqual(['彙總繳費表', '逐筆明細'])
  })

  it('切到逐筆明細渲染 FeeRecordsTab（auto-load），切回彙總表', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.find('[data-seg="list"]').trigger('click')
    await flushAll()
    const records = wrapper.find('[data-testid="records-tab"]')
    expect(records.exists()).toBe(true)
    expect(records.attributes('data-auto-load')).toBe('1')
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(false)

    await wrapper.find('[data-seg="statement"]').trigger('click')
    await flushAll()
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(true)
  })

  it('模式切換只在帳款檢視顯示（預繳/退款不顯示）', async () => {
    const wrapper = mount(FeeBillingWorkspace, {
      props: { view: 'prepayments' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    expect(wrapper.find('[data-test="records-mode-switch"]').exists()).toBe(false)
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

  it('彙總表 open-list（到逐筆明細處理）切換模式並預帶姓名', async () => {
    const wrapper = mount(FeeBillingWorkspace, { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    wrapper.findComponent({ name: 'FeeMonthlyStatement' }).vm.$emit('open-list', '陳部分')
    await flushAll()
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(true)
    expect(recordsMocks.applySearch).toHaveBeenCalledWith('陳部分')
  })

  it('切回帳款檢視時刷新作用中的彙總表', async () => {
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
})
