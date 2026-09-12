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
import { nextTick, ref } from 'vue'
import { PERMISSION_NAMES } from '@/constants/permissions'

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

const authMocks = vi.hoisted(() => ({ hasPermission: vi.fn((_permission: string) => true) }))
vi.mock('@/utils/auth', () => authMocks)

vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }),
}))

vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({
    classrooms: [],
    fetchClassrooms: vi.fn(),
  }),
}))

const receiptSnapshot = vi.hoisted(() => ({ paid: false }))

const statementMocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/components/fees/FeeMonthlyStatement.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeMonthlyStatement',
    props: { classrooms: { type: Array, default: () => [] } },
    emits: ['open-list'],
    setup(_: unknown, { expose }: { expose: (o: Record<string, unknown>) => void }) {
      const paid = ref(receiptSnapshot.paid)
      const filter = ref('')
      expose({ refresh: () => { paid.value = receiptSnapshot.paid; return statementMocks.refresh() } })
      return { paid, filter }
    },
    template: '<div data-testid="monthly-statement"><input data-test="snapshot-statement-filter" v-model="filter" /><span data-test="snapshot-statement">{{ paid ? \'已繳\' : \'未繳\' }}</span></div>',
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
      const paid = ref(receiptSnapshot.paid)
      const filter = ref('')
      expose({
        fetchRecords: () => { paid.value = receiptSnapshot.paid; return recordsMocks.fetchRecords() },
        applySearch: recordsMocks.applySearch,
      })
      return { paid, filter }
    },
    template:
      '<div data-testid="records-tab" :data-auto-load="autoLoad ? \'1\' : \'0\'" :data-initial-search="initialSearch"><input data-test="snapshot-list-filter" v-model="filter" /><span data-test="snapshot-list">{{ paid ? \'已繳\' : \'未繳\' }}</span></div>',
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
vi.mock('@/components/fees/CashItemsView.vue', () => ({ default: { template: '<div data-testid="cash-items" />' } }))
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
vi.mock('../FeeSlipTemplateDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeSlipTemplateDialog',
    props: ['modelValue', 'kind', 'defaultYear', 'defaultMonth'],
    emits: ['update:modelValue'],
    template: '<div />',
  },
}))

const GLOBAL_STUBS = {
  ManualFeeRecordDialog: { name: 'ManualFeeRecordDialog', props: ['modelValue'], emits: ['created', 'update:modelValue'], template: '<div />' },
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

/**
 * 2026-09-07 起 recordsMode 是受控 prop（由 route ?mode= 控制），元件本身只
 * emit change-mode。這個 helper 扮演殼層：把 emit 寫回 prop，讓既有測試仍能
 * 驗「切換後渲染什麼」，同時真的走過受控路徑。
 */
function mountBilling(props: Record<string, unknown> = {}, attachTo?: HTMLElement) {
  let wrapper: ReturnType<typeof mount>
  wrapper = mount(FeeBillingWorkspace, {
    attachTo,
    props: {
      recordsMode: 'statement',
      ...props,
      'onChange-mode': (mode: string) => {
        void wrapper.setProps({ recordsMode: mode })
      },
    },
    global: { stubs: GLOBAL_STUBS },
  })
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  receiptSnapshot.paid = false
  authMocks.hasPermission.mockReturnValue(true)
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
  it('可寫者可新增，建立後刷新學期與總覽並聚焦新費用學生和學期', async () => {
    const wrapper = mountBilling()
    await flushAll()
    await wrapper.get('[data-test="records-mode-switch-list"]').trigger('click')
    const oldRecords = wrapper.findComponent({ name: 'FeeRecordsTab' }).vm
    await wrapper.get('[data-test="records-mode-switch-statement"]').trigger('click')
    await wrapper.get('[data-test="billing-create-manual-fee"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'ManualFeeRecordDialog' })
    expect(dialog.props('modelValue')).toBe(true)
    const beforeSummaryCalls = apiMocks.getFeeSummary.mock.calls.length
    const beforePeriodCalls = apiMocks.getFeePeriods.mock.calls.length
    dialog.vm.$emit('created', { student_name: '測試學生', period: '114-1' })
    await flushAll()
    const records = wrapper.findComponent({ name: 'FeeRecordsTab' })
    expect(records.vm).not.toBe(oldRecords)
    expect(records.props('defaultPeriod')).toBe('114-1')
    expect(records.props('initialSearch')).toBe('測試學生')
    expect(records.props('periodOptions')).toContain('114-1')
    expect(apiMocks.getFeePeriods.mock.calls.length).toBeGreaterThan(beforePeriodCalls)
    expect(apiMocks.getFeeSummary.mock.calls.length).toBeGreaterThan(beforeSummaryCalls)
  })

  it('唯讀人員沒有新增費用入口', async () => {
    authMocks.hasPermission.mockReturnValue(false)
    const wrapper = mountBilling()
    await flushAll()
    expect(wrapper.find('[data-test="billing-create-manual-fee"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ManualFeeRecordDialog' }).exists()).toBe(false)
  })

  it('只有收費寫入權限而無學生讀取權限也沒有新增入口', async () => {
    authMocks.hasPermission.mockImplementation((permission) => permission !== PERMISSION_NAMES.STUDENTS_READ)
    const wrapper = mountBilling()
    await flushAll()
    expect(wrapper.find('[data-test="billing-create-manual-fee"]').exists()).toBe(false)
  })

  it('預設渲染月表（月繳總表），非逐筆明細', async () => {
    const wrapper = mountBilling()
    await flushAll()
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(false)
    const labels = wrapper
      .find('[data-test="records-mode-switch"]')
      .findAll('button')
      .map((b) => b.text())
    expect(labels).toEqual(['每月學生總表', '學期費用明細'])
  })

  it('切到逐筆明細渲染 FeeRecordsTab（auto-load），切回月表', async () => {
    const wrapper = mountBilling()
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
    const wrapper = mountBilling({ view: 'refunds' })
    await flushAll()
    expect(wrapper.find('[data-test="records-mode-switch"]').exists()).toBe(false)
  })

  it('入帳媒合檢視改顯示來源切換（代收／存摺）', async () => {
    const wrapper = mountBilling({ view: 'matching' })
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
    const wrapper = mountBilling({ view: 'matching', source: 'collection' })
    await flushAll()
    await wrapper.find('[data-test="matching-source-switch-passbook"]').trigger('click')
    expect(wrapper.emitted('change-source')).toEqual([['passbook']])
  })

  it('全域搜尋（studentSearch）初始即落地逐筆明細並帶 initial-search', async () => {
    const wrapper = mountBilling({ studentSearch: '王小明', recordsMode: 'list' })
    await flushAll()
    const records = wrapper.find('[data-testid="records-tab"]')
    expect(records.exists()).toBe(true)
    expect(records.attributes('data-initial-search')).toBe('王小明')
  })

  it('搜尋變更時切到逐筆明細並轉交 applySearch', async () => {
    const wrapper = mountBilling()
    await flushAll()
    expect(wrapper.find('[data-testid="monthly-statement"]').exists()).toBe(true)
    await wrapper.setProps({ studentSearch: '陳小華' })
    await flushAll()
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(true)
    expect(recordsMocks.applySearch).toHaveBeenCalledWith('陳小華')
  })

  it('月表 open-list（到逐筆明細處理）切換模式並預帶姓名', async () => {
    const wrapper = mountBilling()
    await flushAll()
    wrapper.findComponent({ name: 'FeeMonthlyStatement' }).vm.$emit('open-list', '陳部分')
    await flushAll()
    expect(wrapper.find('[data-testid="records-tab"]').exists()).toBe(true)
    expect(recordsMocks.applySearch).toHaveBeenCalledWith('陳部分')
  })

  it('切回應收帳款檢視時刷新作用中的月表', async () => {
    const wrapper = mountBilling()
    await flushAll()
    statementMocks.refresh.mockClear()
    await wrapper.setProps({ view: 'refunds' })
    await flushAll()
    expect(statementMocks.refresh).not.toHaveBeenCalled()
    await wrapper.setProps({ view: 'receivable' })
    await flushAll()
    expect(statementMocks.refresh).toHaveBeenCalledTimes(1)
  })
  it('現金項目交由內頁提供新增入口，外層工具列不重複', async () => {
    const wrapper = mountBilling({ view: 'cashItems' })
    await flushAll()
    expect(wrapper.find('[data-testid="cash-items"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="cash-items-create"]').exists()).toBe(false)
  })

})

it.each(['statement', 'list'])('次頁往返保留 %s 實例並更新資料', async (mode) => {
  const wrapper = mountBilling({ recordsMode: mode })
  await flushAll()
  const name = mode === 'statement' ? 'FeeMonthlyStatement' : 'FeeRecordsTab'
  const before = wrapper.findComponent({ name }).vm.$.uid
  await wrapper.setProps({ view: 'matching' })
  await flushAll()
  expect(wrapper.findComponent({ name }).exists()).toBe(false)
  await wrapper.setProps({ view: 'receivable' })
  await flushAll()
  expect(wrapper.findComponent({ name }).vm.$.uid).toBe(before)
  expect(mode === 'statement' ? statementMocks.refresh : recordsMocks.fetchRecords).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it.each([false, true])('返回刷新後恢復捲動，但保留使用者新位置（自行捲動：%s）', async (userScrolled) => {
  const host = document.createElement('main')
  host.id = 'admin-main'
  document.body.append(host)
  const wrapper = mountBilling({}, host)
  await flushAll()
  host.scrollTop = 320
  await wrapper.setProps({ view: 'matching' })
  host.scrollTop = 0
  let finish!: () => void
  statementMocks.refresh.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  await wrapper.setProps({ view: 'receivable' })
  await flushAll()
  if (userScrolled) host.scrollTop = 60
  finish()
  await flushAll()
  expect(host.scrollTop).toBe(userScrolled ? 60 : 320)
  wrapper.unmount()
  host.remove()
})

it('匯入選單用途先行並保留原有 command', async () => {
  const wrapper = mount(FeeBillingWorkspace, {
    global: { stubs: { ...GLOBAL_STUBS,
      'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
    } },
  })
  await flushAll()
  for (const [key, purpose] of [['collection', '登錄銀行繳費'], ['passbook', '核對實際入帳'], ['billslip', '建立費用單']]) {
    const item = wrapper.get(`[data-test="import-${key}"]`)
    expect(item.attributes('command')).toBe(key)
    expect(item.text()).toContain(purpose)
  }
  wrapper.unmount()
})

it.each(['matching', 'generated'])('返回另一個快取模式時更新繳費快照且保留兩種條件（%s）', async (source) => {
  const wrapper = mountBilling()
  await flushAll()
  await wrapper.get('[data-test="snapshot-statement-filter"]').setValue('月表班級')
  expect(wrapper.get('[data-test="snapshot-statement"]').text()).toBe('未繳')
  await wrapper.get('[data-test="records-mode-switch-list"]').trigger('click')
  await flushAll()
  await wrapper.get('[data-test="snapshot-list-filter"]').setValue('逐筆學期')
  expect(recordsMocks.fetchRecords).not.toHaveBeenCalled()
  receiptSnapshot.paid = true
  if (source === 'matching') {
    await wrapper.setProps({ view: 'matching' })
    await wrapper.setProps({ view: 'receivable' })
  } else {
    wrapper.findComponent({ name: 'FeeBillSlipDrawer' }).vm.$emit('generated')
  }
  await flushAll()
  expect(wrapper.get('[data-test="snapshot-list"]').text()).toBe('已繳')
  await wrapper.get('[data-test="records-mode-switch-statement"]').trigger('click')
  await flushAll()
  expect(wrapper.get('[data-test="snapshot-statement"]').text()).toBe('已繳')
  expect((wrapper.get('[data-test="snapshot-statement-filter"]').element as HTMLInputElement).value).toBe('月表班級')
  await wrapper.get('[data-test="records-mode-switch-list"]').trigger('click')
  await flushAll()
  expect((wrapper.get('[data-test="snapshot-list-filter"]').element as HTMLInputElement).value).toBe('逐筆學期')
  wrapper.unmount()
})
