vi.mock('@/api/attendanceMonthContext', () => ({
  getAttendanceMonthContext: vi.fn().mockResolvedValue({ data: { roster: [], days: [] } }),
  getAttendanceWorkingMonth: vi.fn().mockResolvedValue({ data: { year: 2026, month: 9, previous_unsettled: false } }),
}))
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useRoute: () => ({ query: {} }) }))

const getSummaryMock = vi.fn()
const getAnomalyListMock = vi.fn()
const getRecordsMock = vi.fn()

vi.mock('@/api/attendance', () => ({
  getSummary: (...args: unknown[]) => getSummaryMock(...args),
  getAnomalyList: (...args: unknown[]) => getAnomalyListMock(...args),
  getRecords: (...args: unknown[]) => getRecordsMock(...args),
  batchConfirmAnomalies: vi.fn().mockResolvedValue({ data: {} }),
  upsertRecord: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/utils/auth', () => ({ hasFullSalaryView: () => false, hasPermission: () => true }))

const mockIsMobile = ref(true)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: vi.fn() }) }))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn().mockResolvedValue(undefined) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

// 頁面建立的整月格子（useMonthGrid）走這支 API；用呼叫次數斷言「資料異動後整月資料重抓」
const monthApi = vi.hoisted(() => ({ grid: vi.fn(async () => ({ data: null })) }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: monthApi.grid }))

import ScheduleAttendanceView from '../ScheduleAttendanceView.vue'
import { attendanceRouteProps } from '@/router/attendanceRouteProps'

// el-tabs stub：保留 v-model 契約（modelValue + update:modelValue），
// 這正是本次要驗的東西——原本的 el-tabs 沒有接 v-model，選取後不會換頁。
const ElTabsStub = {
  name: 'ElTabs',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div class="el-tabs" :data-active="modelValue"><slot /></div>',
}
const ElTabPaneStub = {
  name: 'ElTabPane',
  props: ['label', 'name'],
  template: '<div class="el-tab-pane" :data-name="name" :data-label="label"><slot /></div>',
}

const RosterColumnStub = {
  name: 'RosterColumn',
  props: ['roster', 'selectedEmployeeId', 'loading'],
  emits: ['select'],
  template: '<div class="roster-column-stub" />',
}
const AnomalyQueueColumnStub = {
  name: 'AnomalyQueueColumn',
  props: ['items', 'selectedIndex', 'loading'],
  emits: ['select', 'filterChange', 'resolved'],
  template: '<div class="anomaly-queue-column-stub" />',
}
const DetailColumnStub = {
  name: 'DetailColumn',
  props: ['mode', 'anomaly', 'anomalyIndex', 'anomalyTotal', 'context', 'employeeId', 'year', 'month'],
  emits: ['resolved', 'navigate', 'switchMode'],
  template: '<div class="detail-column-stub" />',
}

const ScheduleGridPanelStub = {
  name: 'ScheduleGridPanel',
  props: ['mode', 'date', 'filter', 'focusEmployeeId', 'focusDate', 'revision'],
  emits: ['records', 'import', 'changed', 'update:date', 'update:filter'],
  methods: { confirmWeekChange: async () => true },
  template: '<div class="grid-panel-stub" />',
}
const MonthProgressBarStub = { name: 'MonthProgressBar', props: ['month', 'mobile'], emits: ['show-issues'], template: '<div class="month-progress-stub" />' }
/** 核對檢視與排班子頁籤是 el-radio-group（按鈕樣式）：按鈕點了請群組送出 update:modelValue */
const RadioGroupStub = {
  name: 'ElRadioGroup',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  provide() { return { pickRadio: (v: string) => (this as unknown as { $emit: (e: string, v: string) => void }).$emit('update:modelValue', v) } },
  template: '<div role="radiogroup" :data-value="modelValue"><slot /></div>',
}
const RadioButtonStub = { props: ['value'], inject: ['pickRadio'], template: '<button type="button" @click="pickRadio(value)"><slot /></button>' }
const SHELL_STUBS = {
  ScheduleGridPanel: ScheduleGridPanelStub,
  MonthProgressBar: MonthProgressBarStub,
  DutyRotationPanel: { name: 'DutyRotationPanel', template: '<div class="rotation-stub" />' },
  SwapHistoryPanel: { name: 'SwapHistoryPanel', template: '<div class="swaps-stub" />' },
}
const STUBS = {
  ElDrawer: { props: ['modelValue'], template: '<section data-test="anomaly-drawer" :data-open="String(modelValue)"><slot /></section>' },
  ...SHELL_STUBS,
  RosterColumn: RosterColumnStub,
  AnomalyQueueColumn: AnomalyQueueColumnStub,
  DetailColumn: DetailColumnStub,
  ImportPreviewDialog: { name: 'ImportPreviewDialog', props: ['modelValue', 'year', 'month'], template: '<div />' },
  WorkspaceHeader: { name: 'WorkspaceHeader', props: ['year', 'month', 'kpis'], template: '<div />' },
  ElTabs: ElTabsStub,
  ElTabPane: ElTabPaneStub,
  ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElIcon: true,
  ElRadioGroup: RadioGroupStub,
  ElRadioButton: RadioButtonStub,
}

const sampleRoster = [
  { employee_id: 1, employee_name: '王小明', employee_number: 'E001', normal_days: 20, late_count: 1, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0, total_late_minutes: 10 },
]
const sampleAnomalies = [
  { id: 10, employee_name: '王小明', employee_number: 'E001', date: '2026-06-05', weekday: '五', type: 'late', type_label: '遲到', detail: '遲到 10 分', estimated_deduction: 200, confirmed_action: null },
  { id: 11, employee_name: '李小花', employee_number: 'E002', date: '2026-06-10', weekday: '三', type: 'missing_punch', type_label: '未打卡', detail: '缺出勤打卡', estimated_deduction: 0, confirmed_action: null },
]

/** 名冊與明細在核對頁籤的「逐人」檢視（舊 ?tab=records 落在這裡） */
const mountView = () => mount(ScheduleAttendanceView, { props: attendanceRouteProps({ tab: 'records' }), global: { stubs: STUBS } })

describe('ScheduleAttendanceView 手機三段流程（核對 › 逐人）', () => {
  beforeEach(() => {
    mockIsMobile.value = true
    getSummaryMock.mockReset().mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock
      .mockReset()
      .mockResolvedValue({ data: { items: sampleAnomalies, pending: 2, total: 2, confirmed: 0 } })
    getRecordsMock.mockReset().mockResolvedValue({ data: [] })
  })

  it.each([true, false])('批次處理成功會讓格子與本月進度重算（手機=%s）', async (mobile) => {
    mockIsMobile.value = mobile
    const wrapper = mount(ScheduleAttendanceView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(0)
    const monthCallsBefore = monthApi.grid.mock.calls.length
    await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('resolved')
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(1)
    expect(monthApi.grid.mock.calls.length).toBe(monthCallsBefore + 1)
    wrapper.unmount()
  })

  it('手機預設停在名冊分頁；逐人檢視顯示名冊與明細的分頁殼', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[data-test="reconcile-view"]').attributes('data-value')).toBe('person')
    expect(wrapper.get('[data-test="records-panel"]').attributes('style') ?? '').not.toContain('display: none')
    expect(wrapper.get('.el-tabs').attributes('data-active')).toBe('roster')
  })

  it('名冊選取員工後自動推進到明細分頁', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent(RosterColumnStub).vm.$emit('select', 1)
    await flushPromises()

    expect(wrapper.get('.el-tabs').attributes('data-active')).toBe('detail')
    expect(wrapper.findComponent(DetailColumnStub).props('mode')).toBe('month')
  })

  it('異常佇列選取後自動推進到明細分頁並帶 resolve 模式', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('select', 1)
    await flushPromises()

    expect(wrapper.get('.el-tabs').attributes('data-active')).toBe('detail')
    expect(wrapper.findComponent(DetailColumnStub).props('mode')).toBe('resolve')
  })

  it('明細分頁提供返回鍵，從異常進來就回異常、從名冊進來就回名冊', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('select', 0)
    await flushPromises()
    await wrapper.get('[data-test="mobile-detail-back"]').trigger('click')
    expect(wrapper.get('[data-test="anomaly-drawer"]').attributes('data-open')).toBe('true')

    await wrapper.findComponent(RosterColumnStub).vm.$emit('select', 1)
    await flushPromises()
    await wrapper.get('[data-test="mobile-detail-back"]').trigger('click')
    expect(wrapper.get('.el-tabs').attributes('data-active')).toBe('roster')
  })

  it('異常清單按鈕寫出範圍與待處理筆數（一人一天一筆）', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('button').find(button => button.text() === '遲到・早退・缺卡清單（2 筆待處理）')).toBeDefined()
  })

  it('桌機：仍走三欄，不渲染分頁殼', async () => {
    mockIsMobile.value = false
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.workspace-cols').exists()).toBe(true)
    expect(wrapper.find('.el-tabs').exists()).toBe(false)
    expect(wrapper.find('[data-test="mobile-detail-back"]').exists()).toBe(false)
  })
})
