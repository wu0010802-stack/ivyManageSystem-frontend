const workingMonth = vi.hoisted(() => vi.fn())
vi.mock('@/api/attendanceMonthContext', () => ({
  getAttendanceMonthContext: vi.fn().mockResolvedValue({ data: { roster: [], days: [] } }),
  getAttendanceWorkingMonth: (...args: unknown[]) => workingMonth(...args),
}))
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ScheduleAttendanceView from '../ScheduleAttendanceView.vue'
import { downloadFile } from '@/utils/download'

const routerReplace = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
  useRoute: () => ({ query: {} }),
}))

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

const mockHasFullSalaryView = vi.fn(() => false)
const mockHasPermission = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
  hasFullSalaryView: () => mockHasFullSalaryView(),
}))

// 裝置寬度：掛載前改 value（元件 setup 時才讀）；各案例結束由 describe 的 afterEach 還原
const mockIsMobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(mockIsMobile.value), cleanup: () => {} }) }
})

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))

vi.mock('@/utils/download', () => ({
  downloadFile: vi.fn().mockResolvedValue(undefined),
}))

const msgBoxConfirm = vi.hoisted(() => vi.fn())
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: msgBoxConfirm },
  ElTabs: { template: '<div class="el-tabs"><slot /></div>' },
  ElTabPane: { template: '<div class="el-tab-pane"><slot /></div>', props: ['label', 'name'] },
}))

// 頁面建立的整月格子（useMonthGrid）走這支 API；用呼叫次數斷言「資料異動後整月資料重抓」
const monthApi = vi.hoisted(() => ({ grid: vi.fn(async () => ({ data: null })) }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: monthApi.grid }))

// ── stub component factories ────────────────────────────────────────────────────
const RosterColumnStub = {
  name: 'RosterColumn',
  props: ['roster', 'selectedEmployeeId', 'loading'],
  emits: ['select'],
  template: `<div class="roster-column-stub"><slot /></div>`,
}

const AnomalyQueueColumnStub = {
  name: 'AnomalyQueueColumn',
  props: ['items', 'selectedIndex', 'loading'],
  emits: ['select', 'filterChange', 'resolved'],
  template: `<div class="anomaly-queue-column-stub"><slot /></div>`,
}

const DetailColumnStub = {
  name: 'DetailColumn',
  props: ['mode', 'anomaly', 'anomalyIndex', 'anomalyTotal', 'context', 'employeeId', 'year', 'month', 'focusDate', 'revision'],
  emits: ['resolved', 'navigate', 'switchMode', 'retryRecords', 'openGrid'],
  template: `<div class="detail-column-stub"><slot /></div>`,
}

const ImportPreviewDialogStub = {
  name: 'ImportPreviewDialog',
  props: ['modelValue', 'year', 'month', 'sourceContext'],
  emits: ['update:modelValue', 'imported'],
  template: `<div class="import-preview-dialog-stub"><slot /></div>`,
}

const WorkspaceHeaderStub = {
  name: 'WorkspaceHeader',
  props: ['year', 'month', 'canPayrollCompare'],
  emits: ['update:year', 'update:month', 'update:period', 'import', 'export', 'payroll', 'recalculate'],
  template: `<div class="workspace-header-stub"><slot /><slot name="month-tools" /></div>`,
}

/** 格子面板的「換週前確認未儲存變更」；預設放行 */
const panelConfirmWeekChange = vi.fn(async (_date: string) => true)
const AttendanceMonthStatsStub = {
  name: 'AttendanceMonthStats',
  props: ['kpis', 'displayState'],
  template: '<div class="month-stats-stub" />',
}

const ScheduleGridPanelStub = {
  name: 'ScheduleGridPanel',
  props: ['date', 'filter', 'focusEmployeeId', 'focusDate', 'revision', 'view', 'month', 'headerHasMonth'],
  emits: ['records', 'import', 'import-punches', 'changed', 'update:date', 'update:filter', 'update:view', 'show-patterns', 'recalculate', 'focus-handled'],
  methods: { confirmWeekChange: (date: string) => panelConfirmWeekChange(date) },
  template: '<div class="grid-panel-stub" />',
}
const rotationMounts = { count: 0 }
const openPatternsSpy = vi.fn()
const MonthProgressBarStub = { name: 'MonthProgressBar', props: ['month', 'mobile'], emits: ['show-issues', 'changed', 'summary', 'records', 'import', 'recalculate'], methods: { openPatterns: () => openPatternsSpy() }, template: '<div class="month-progress-stub" />' }
const RecalcDrawerStub = { name: 'RecalculateAttendanceDrawer', props: ['modelValue', 'year', 'month', 'mobile'], emits: ['update:modelValue', 'done'], template: '<div class="recalc-stub" />' }
const SHELL_STUBS = {
  ScheduleGridPanel: ScheduleGridPanelStub,
  MonthProgressBar: MonthProgressBarStub,
  DutyRotationPanel: { name: 'DutyRotationPanel', emits: ['applied', 'changed'], mounted() { rotationMounts.count++ }, template: '<div class="rotation-stub" />' },
  SwapHistoryPanel: { name: 'SwapHistoryPanel', template: '<div class="swaps-stub" />' },
}
const STUBS = {
  ElDrawer: { props: ['modelValue'], template: '<section data-test="anomaly-drawer" :data-open="String(modelValue)"><slot /></section>' },
  PayrollComparisonDialog: { name: 'PayrollComparisonDialog', props: ['modelValue'], template: '<div />' },
  ...SHELL_STUBS,
  RosterColumn: RosterColumnStub,
  AnomalyQueueColumn: AnomalyQueueColumnStub,
  DetailColumn: DetailColumnStub,
  ImportPreviewDialog: ImportPreviewDialogStub,
  RecalculateAttendanceDrawer: RecalcDrawerStub,
  WorkspaceHeader: WorkspaceHeaderStub,
  AttendanceMonthStats: AttendanceMonthStatsStub,
  'el-tabs': { template: '<div class="el-tabs"><slot /></div>' },
  'el-tab-pane': { template: '<div class="el-tab-pane"><slot /></div>', props: ['label'] },
  'el-select': { template: '<select @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>' },
  'el-option': { template: '<option><slot /></option>' },
  'el-statistic': { template: '<div class="el-statistic"><span class="el-statistic__title">{{ title }}</span><span class="el-statistic__number">{{ value }}</span></div>', props: ['title', 'value'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-card': { template: '<div class="el-card"><slot /><slot name="header" /></div>' },
  'el-icon': true,
}

// sample fixtures
const sampleRoster = [
  { employee_id: 1, employee_name: '王小明', employee_number: 'E001', normal_days: 20, late_count: 1, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0, total_late_minutes: 10 },
  { employee_id: 2, employee_name: '李小花', employee_number: 'E002', normal_days: 22, late_count: 0, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0, total_late_minutes: 0 },
]

const sampleAnomalies = [
  { id: 10, employee_name: '王小明', employee_number: 'E001', date: '2026-06-05', weekday: '五', type: 'late', type_label: '遲到', detail: '遲到 10 分', estimated_deduction: 200, confirmed_action: null },
  { id: 11, employee_name: '李小花', employee_number: 'E002', date: '2026-06-10', weekday: '三', type: 'missing_punch', type_label: '未打卡', detail: '缺出勤打卡', estimated_deduction: 0, confirmed_action: null },
]

const mountView = () =>
  mount(ScheduleAttendanceView, {
    global: { stubs: STUBS },
    attachTo: document.body,
  })

describe('ScheduleAttendanceView', () => {
  beforeEach(() => {
    mockHasFullSalaryView.mockReturnValue(false)
    getSummaryMock.mockReset()
    getAnomalyListMock.mockReset()
    getRecordsMock.mockReset()

    getSummaryMock.mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockResolvedValue({
      data: { items: sampleAnomalies, pending: 2, total: 2, confirmed: 0 },
    })
    getRecordsMock.mockResolvedValue({ data: [] })
  })

  // ── 基礎掛載 ────────────────────────────────────────────────────────────────
  it('掛載後觸發 refresh（呼叫 getSummary 和 getAnomalyList）', async () => {
    mountView()
    await flushPromises()
    expect(getSummaryMock).toHaveBeenCalledTimes(1)
    expect(getAnomalyListMock).toHaveBeenCalledTimes(1)
  })

  // ── 兩欄渲染 ────────────────────────────────────────────────────────────────
  it('桌機模式：保留名冊與明細兩欄', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.workspace-cols').exists()).toBe(true)
    expect(wrapper.find('.col-roster').exists()).toBe(true)
    expect(wrapper.find('.workspace-cols .col-anomaly').exists()).toBe(false)
    expect(wrapper.find('.col-detail').exists()).toBe(true)
  })

  it('桌機模式：異常清單位於抽屜，名冊與明細保留', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent(RosterColumnStub).exists()).toBe(true)
    expect(wrapper.findComponent(AnomalyQueueColumnStub).exists()).toBe(true)
    expect(wrapper.findComponent(DetailColumnStub).exists()).toBe(true)
  })

  it('ImportPreviewDialog 元件渲染', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent(ImportPreviewDialogStub).exists()).toBe(true)
  })

  // ── 異常選取 → DetailColumn props ────────────────────────────────────────
  it('AnomalyQueueColumn emit select(1) → DetailColumn anomaly=第2筆、mode=resolve', async () => {
    const wrapper = mountView()
    await flushPromises()
    const aqc = wrapper.findComponent(AnomalyQueueColumnStub)
    await aqc.vm.$emit('select', 1)
    await flushPromises()
    const dc = wrapper.findComponent(DetailColumnStub)
    // P1-4：佇列元素為日卡（依 attendance id 分組，異常收在 items[]）
    expect(dc.props('anomaly')).toMatchObject({
      id: sampleAnomalies[1].id,
      employee_name: sampleAnomalies[1].employee_name,
      items: [expect.objectContaining({ type: sampleAnomalies[1].type })],
    })
    expect(dc.props('mode')).toBe('resolve')
  })

  it('AnomalyQueueColumn emit select(0) → DetailColumn anomaly=第1筆', async () => {
    const wrapper = mountView()
    await flushPromises()
    const aqc = wrapper.findComponent(AnomalyQueueColumnStub)
    await aqc.vm.$emit('select', 0)
    await flushPromises()
    const dc = wrapper.findComponent(DetailColumnStub)
    expect(dc.props('anomaly')).toMatchObject({
      id: sampleAnomalies[0].id,
      items: [expect.objectContaining({ type: sampleAnomalies[0].type })],
    })
  })

  // ── 人員選取 → DetailColumn mode=month ────────────────────────────────────
  it('RosterColumn emit select(empId) → DetailColumn mode=month、employeeId 正確', async () => {
    const wrapper = mountView()
    await flushPromises()
    const rc = wrapper.findComponent(RosterColumnStub)
    await rc.vm.$emit('select', 2)
    await flushPromises()
    const dc = wrapper.findComponent(DetailColumnStub)
    expect(dc.props('mode')).toBe('month')
    expect(dc.props('employeeId')).toBe(2)
  })

  // ── resolved → refresh ───────────────────────────────────────────────────
  it('DetailColumn emit resolved → getSummary/getAnomalyList 再次被呼叫', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(getSummaryMock).toHaveBeenCalledTimes(1)
    expect(getAnomalyListMock).toHaveBeenCalledTimes(1)

    const dc = wrapper.findComponent(DetailColumnStub)
    await dc.vm.$emit('resolved')
    await flushPromises()
    expect(getSummaryMock).toHaveBeenCalledTimes(2)
    expect(getAnomalyListMock).toHaveBeenCalledTimes(2)
  })

  // ── 異常多選批次處理 resolved → refresh ──────────────────────────────────
  it('AnomalyQueueColumn emit resolved → getSummary/getAnomalyList 再次被呼叫', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(getSummaryMock).toHaveBeenCalledTimes(1)
    expect(getAnomalyListMock).toHaveBeenCalledTimes(1)

    const aqc = wrapper.findComponent(AnomalyQueueColumnStub)
    await aqc.vm.$emit('resolved')
    await flushPromises()
    expect(getSummaryMock).toHaveBeenCalledTimes(2)
    expect(getAnomalyListMock).toHaveBeenCalledTimes(2)
  })

  // ── 匯入 dialog 開啟 ─────────────────────────────────────────────────────
  it('Header emit import → ImportPreviewDialog modelValue=true', async () => {
    const wrapper = mountView()
    await flushPromises()
    const header = wrapper.findComponent(WorkspaceHeaderStub)
    await header.vm.$emit('import')
    await flushPromises()
    const dialog = wrapper.findComponent(ImportPreviewDialogStub)
    expect(dialog.props('modelValue')).toBe(true)
  })

  // ── 匯入完成 → refresh ───────────────────────────────────────────────────
  it('ImportPreviewDialog emit imported → refresh 再呼叫', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(getSummaryMock).toHaveBeenCalledTimes(1)

    const dialog = wrapper.findComponent(ImportPreviewDialogStub)
    await dialog.vm.$emit('imported', { count: 5 })
    await flushPromises()
    expect(getSummaryMock).toHaveBeenCalledTimes(2)
    expect(getAnomalyListMock).toHaveBeenCalledTimes(2)
  })

  // ── navigate delta ───────────────────────────────────────────────────────
  it('DetailColumn emit navigate(1) → selectedAnomalyIndex 前進', async () => {
    const wrapper = mountView()
    await flushPromises()
    // 先選第 0 筆（默認）
    const dc = wrapper.findComponent(DetailColumnStub)
    expect(dc.props('anomalyIndex')).toBe(0)
    await dc.vm.$emit('navigate', 1)
    await flushPromises()
    expect(dc.props('anomalyIndex')).toBe(1)
  })

  it('DetailColumn emit navigate(-1) 在 index=0 不超界', async () => {
    const wrapper = mountView()
    await flushPromises()
    const dc = wrapper.findComponent(DetailColumnStub)
    expect(dc.props('anomalyIndex')).toBe(0)
    await dc.vm.$emit('navigate', -1)
    await flushPromises()
    expect(dc.props('anomalyIndex')).toBe(0)
  })

  // ── 換月後 getRecords 以新月份重新呼叫（watch 合併後的回歸保護）──────────────
  it('換月後 getRecords 以新月份再次被呼叫（不命中舊月快取）', async () => {
    const sampleRecordsMonth6 = [
      { date: '2026-06-05', punch_in: '09:00', punch_out: '18:00', status: null },
    ]
    const sampleRecordsMonth7 = [
      { date: '2026-07-03', punch_in: '08:55', punch_out: '17:30', status: null },
    ]
    getRecordsMock.mockResolvedValue({ data: sampleRecordsMonth6 })

    const wrapper = mountView()
    await flushPromises()

    // 選取員工 1 → 觸發第一次 getRecords（6 月）
    const rc = wrapper.findComponent(RosterColumnStub)
    await rc.vm.$emit('select', 1)
    await flushPromises()
    // recordsCache 只餵 resolve 模式的 ResolveCard；整月明細由 EmployeeMonthPanel
    // 自己抓同一支 API（2026-09-11 起不再兩邊都抓），故先切到 resolve 再驗證。
    wrapper.findComponent(DetailColumnStub).vm.$emit('switchMode', 'resolve')
    await flushPromises()

    expect(getRecordsMock).toHaveBeenCalledTimes(1)
    expect(getRecordsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ month: expect.any(Number), employee_id: 1 }),
    )
    const callMonth6 = getRecordsMock.mock.calls[0][0].month

    // 換月 → 應清快取並以新月份重新呼叫 getRecords
    getRecordsMock.mockResolvedValue({ data: sampleRecordsMonth7 })
    const header = wrapper.findComponent(WorkspaceHeaderStub)
    await header.vm.$emit('update:month', callMonth6 + 1)
    await flushPromises()

    expect(getRecordsMock).toHaveBeenCalledTimes(2)
    const callMonth7 = getRecordsMock.mock.calls[1][0].month
    expect(callMonth7).toBe(callMonth6 + 1)
  })

  // ── P1-4：resolve 後 recordsCache 失效（明細不得顯示舊資料）────────────────
  it('resolved 後 recordsCache 失效並重抓當前員工明細', async () => {
    getRecordsMock.mockResolvedValue({
      data: [{ date: '2026-06-05', punch_in: null, punch_out: '17:00', status: null }],
    })

    const wrapper = mountView()
    await flushPromises()

    const rc = wrapper.findComponent(RosterColumnStub)
    await rc.vm.$emit('select', 1)
    await flushPromises()
    // recordsCache 只餵 resolve 模式的 ResolveCard；整月明細由 EmployeeMonthPanel
    // 自己抓同一支 API（2026-09-11 起不再兩邊都抓），故先切到 resolve 再驗證。
    wrapper.findComponent(DetailColumnStub).vm.$emit('switchMode', 'resolve')
    await flushPromises()
    expect(getRecordsMock).toHaveBeenCalledTimes(1)

    // 補卡成功（DetailColumn emit resolved）→ 快取應失效並以同員工重抓
    getRecordsMock.mockResolvedValue({
      data: [{ date: '2026-06-05', punch_in: '08:00', punch_out: '17:00', status: null }],
    })
    const dc = wrapper.findComponent(DetailColumnStub)
    await dc.vm.$emit('resolved')
    await flushPromises()

    expect(getRecordsMock).toHaveBeenCalledTimes(2)
    expect(getRecordsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ employee_id: 1 }),
    )
  })

  // ── P1-4：匯入後 recordsCache 失效 ─────────────────────────────────────────
  it('imported 後 recordsCache 失效（下次選取重抓）', async () => {
    getRecordsMock.mockResolvedValue({ data: [] })

    const wrapper = mountView()
    await flushPromises()

    const rc = wrapper.findComponent(RosterColumnStub)
    await rc.vm.$emit('select', 1)
    await flushPromises()
    // recordsCache 只餵 resolve 模式的 ResolveCard；整月明細由 EmployeeMonthPanel
    // 自己抓同一支 API（2026-09-11 起不再兩邊都抓），故先切到 resolve 再驗證。
    wrapper.findComponent(DetailColumnStub).vm.$emit('switchMode', 'resolve')
    await flushPromises()
    expect(getRecordsMock).toHaveBeenCalledTimes(1)

    const dialog = wrapper.findComponent(ImportPreviewDialogStub)
    await dialog.vm.$emit('imported', {})
    await flushPromises()

    // 匯入後對當前員工立即重抓（快取已失效）
    expect(getRecordsMock).toHaveBeenCalledTimes(2)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// WorkspaceHeader 單元測試
// ──────────────────────────────────────────────────────────────────────────────
import WorkspaceHeader from '@/components/attendance/WorkspaceHeader.vue'
import AttendanceMonthStats from '@/components/attendance/AttendanceMonthStats.vue'

const WH_STUBS = {
  'el-select': {
    template: '<select @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot /></select>',
    props: ['modelValue'],
  },
  'el-option': { template: '<option :value="value"><slot /></option>', props: ['value', 'label'] },
  'el-statistic': {
    template: '<div class="el-statistic"><span class="el-statistic__title">{{ title }}</span><span class="el-statistic__number">{{ value }}</span></div>',
    props: ['title', 'value'],
  },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
}

const WH_DROPDOWN = {
  name: 'ElDropdown',
  emits: ['command'],
  template: '<div class="el-dropdown-stub"><slot /><slot name="dropdown" /></div>',
}
const WH_ITEM = { props: ['command'], template: '<div class="el-dropdown-item-stub" :data-command="command"><slot /></div>' }

describe('WorkspaceHeader', () => {
  const defaultProps = { year: 2026, month: 6 }
  const mountHeader = (props: Record<string, unknown> = {}) =>
    mount(WorkspaceHeader, {
      props: { ...defaultProps, ...props },
      global: { stubs: { ...WH_STUBS, 'el-dropdown': WH_DROPDOWN, 'el-dropdown-menu': { template: '<div><slot /></div>' }, 'el-dropdown-item': WH_ITEM, 'el-icon': true } },
    })

  it('點「匯入打卡紀錄」emit import 事件', async () => {
    const wrapper = mountHeader()
    const importBtn = wrapper.findAll('button').find(b => b.text() === '匯入打卡紀錄')
    expect(importBtn).toBeDefined()
    await importBtn!.trigger('click')
    expect(wrapper.emitted('import')).toBeTruthy()
  })

  it('月底作業選單：匯出月報 emit export；有薪資檢視權限才有薪資扣項核對', async () => {
    const wrapper = mountHeader()
    // 選單裡是月底要做的事、不會結帳：不叫「月結」
    expect(wrapper.find('[aria-label="月底作業"]').text()).toContain('匯出月報')
    expect(wrapper.text()).not.toContain('月結')
    expect(wrapper.find('[data-command="payroll"]').exists()).toBe(false)
    wrapper.findComponent(WH_DROPDOWN).vm.$emit('command', 'export')
    expect(wrapper.emitted('export')).toBeTruthy()

    const withPayroll = mountHeader({ canPayrollCompare: true })
    expect(withPayroll.find('[data-command="payroll"]').text()).toBe('薪資扣項核對')
    withPayroll.findComponent(WH_DROPDOWN).vm.$emit('command', 'payroll')
    expect(withPayroll.emitted('payroll')).toBeTruthy()
  })

  it('不再顯示出勤統計（統計移到出勤明細頁籤）', () => {
    expect(mountHeader().text()).not.toContain('待處理異常')
  })

  it('權限 gate：hasPermission 回 false 時「匯入打卡紀錄」不顯示，月底作業選單仍在', () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = mountHeader()
    expect(wrapper.findAll('button').find((b) => b.text().includes('匯入'))).toBeUndefined()
    expect(wrapper.find('[aria-label="月底作業"]').exists()).toBe(true)
    mockHasPermission.mockReturnValue(true)
  })
})

describe('AttendanceMonthStats', () => {
  it('渲染四個統計與範圍說明', () => {
    const wrapper = mount(AttendanceMonthStats, {
      props: { displayState: 'ready', kpis: { fullAttendance: 5, lateCount: 3, missingCount: 1, pendingAnomalies: 2 } },
      global: { stubs: WH_STUBS },
    })
    expect(wrapper.text()).toContain('待處理遲到／早退／缺卡')
    expect(wrapper.text()).toContain('0 筆異常不代表打卡資料已齊全')
  })
})

describe('班表核對與明細互通', () => {
  beforeEach(() => {
    routerReplace.mockReset()
    mockHasPermission.mockReturnValue(true)
    getSummaryMock.mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    getRecordsMock.mockResolvedValue({ data: [] })
  })

  it('格子抽屜「匯入這天打卡」帶人員與日期開匯入，月份切到該日', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-06' }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('import', { employee_id: 2, employee_name: '測試員工', date: '2026-08-31' })
    await flushPromises()
    const dialog = wrapper.findComponent(ImportPreviewDialogStub)
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('month')).toBe(8)
    expect(dialog.props('sourceContext')).toEqual({ employee_id: 2, employee_name: '測試員工', date: '2026-08-31' })
    wrapper.unmount()
  })

  it('網址拿掉 filter（站內導航到不帶篩選的連結）時，畫面回到全部，與網址一致', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'grid', filter: 'issues' }, global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('filter')).toBe('issues')
    await wrapper.setProps({ filter: undefined })
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('filter')).toBe('all')
    wrapper.unmount()
  })

  it('學期輪值表與換班紀錄不顯示本月進度（那兩頁不是以月為範圍）', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'rotation' }, global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.find('.month-progress-stub').attributes('style') ?? '').toContain('display: none')
    await wrapper.find('[data-test="tab-grid"]').trigger('click')
    expect(wrapper.find('.month-progress-stub').attributes('style') ?? '').not.toContain('display: none')
    wrapper.unmount()
  })

  it('?tab= 深連結在已停留於本頁時仍切換頁籤，格子面板保留不卸載', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'grid' }, global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.find('[data-test="tab-grid"]').attributes('aria-selected')).toBe('true')
    await wrapper.setProps({ tab: 'records' })
    await flushPromises()
    expect(wrapper.find('[data-test="tab-records"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.findComponent(ScheduleGridPanelStub).exists()).toBe(true)
    await wrapper.setProps({ tab: 'grid' })
    expect(wrapper.find('[data-test="tab-grid"]').attributes('aria-selected')).toBe('true')
    wrapper.unmount()
  })

  it('本月進度關閉老師確認後，格子與本月進度重算', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-06' }, global: { stubs: STUBS } })
    await flushPromises()
    const monthCallsBefore = monthApi.grid.mock.calls.length
    wrapper.findComponent(MonthProgressBarStub).vm.$emit('changed')
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(1)
    expect(monthApi.grid.mock.calls.length).toBe(monthCallsBefore + 1)
    wrapper.unmount()
  })

  it('格子異動（確認／改班）後，出勤明細的整月表也要刷新（importRevision 遞增）', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-06' }, global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.findComponent(DetailColumnStub).props('revision')).toBe(0)
    const monthCallsBefore = monthApi.grid.mock.calls.length
    wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('changed')
    await flushPromises()
    expect(wrapper.findComponent(DetailColumnStub).props('revision')).toBe(1)
    // 格子自己的編輯：本月進度重算，格子不重複載入（格子已自行 reload）
    expect(monthApi.grid.mock.calls.length).toBe(monthCallsBefore + 1)
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(0)
    wrapper.unmount()
  })

  it('月結選單與本月設定檢查都能開「重算本月出勤」；重算完整頁重抓', async () => {
    mockHasPermission.mockReturnValue(true)
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-16' }, global: { stubs: STUBS } })
    await flushPromises()
    const drawer = () => wrapper.findComponent(RecalcDrawerStub)
    expect(drawer().props('modelValue')).toBe(false)
    expect([drawer().props('year'), drawer().props('month')]).toEqual([2026, 9])
    wrapper.findComponent(WorkspaceHeaderStub).vm.$emit('recalculate')
    await flushPromises()
    expect(drawer().props('modelValue')).toBe(true)
    drawer().vm.$emit('update:modelValue', false)
    wrapper.findComponent(MonthProgressBarStub).vm.$emit('recalculate')
    await flushPromises()
    expect(drawer().props('modelValue')).toBe(true)
    const before = monthApi.grid.mock.calls.length
    drawer().vm.$emit('done')
    await flushPromises()
    expect(monthApi.grid.mock.calls.length).toBe(before + 1)
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('本月設定檢查的「看他整月」與「匯入打卡」走頁面同一套流程', async () => {
    mockHasPermission.mockReturnValue(true)
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-16' }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(MonthProgressBarStub).vm.$emit('records', 7, '2026-09-01')
    await flushPromises()
    expect(wrapper.find('[data-test="tab-records"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.findComponent(DetailColumnStub).props('employeeId')).toBe(7)
    expect(wrapper.findComponent(DetailColumnStub).props('focusDate')).toBe('2026-09-01')
    wrapper.findComponent(MonthProgressBarStub).vm.$emit('import')
    await flushPromises()
    expect(wrapper.findComponent(ImportPreviewDialogStub).props('modelValue')).toBe(true)
    // 整月匯入：不帶單一人員的來源
    expect(wrapper.findComponent(ImportPreviewDialogStub).props('sourceContext')).toBeNull()
    wrapper.unmount()
  })

  it('格子「看他整月」切到明細並聚焦該人該日；明細處理完讓格子與本月進度重算', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-06' }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('records', 2, '2026-08-31')
    await flushPromises()
    expect(wrapper.find('[data-test="tab-records"]').attributes('aria-selected')).toBe('true')
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { tab: 'records', date: '2026-08-31' } })
    const detail = wrapper.findComponent(DetailColumnStub)
    expect(detail.props('mode')).toBe('month')
    expect(detail.props('employeeId')).toBe(2)
    expect(detail.props('year')).toBe(2026)
    expect(detail.props('month')).toBe(8)
    expect(detail.props('focusDate')).toBe('2026-08-31')
    const monthCallsBefore = monthApi.grid.mock.calls.length
    await wrapper.findComponent(DetailColumnStub).vm.$emit('resolved')
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(1)
    expect(monthApi.grid.mock.calls.length).toBe(monthCallsBefore + 1)
    await wrapper.findComponent(WorkspaceHeaderStub).vm.$emit('update:month', 9)
    await flushPromises()
    expect(wrapper.findComponent(DetailColumnStub).props('focusDate')).toBeNull()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('date')).toBe('2026-09-01')
    wrapper.unmount()
  })

  // 月模式點的格子可在任一週：抽屜的「看他整月」與「匯入這天打卡」要把錨點移到別週時，
  // 一樣要先問面板未儲存的週排班（Review Focus #4），否則錨點跨週會讓格子無聲捨棄緩衝。
  describe('抽屜動作把錨點移到別週（月模式）', () => {
    const OTHER_WEEK_DATE = '2026-09-29' // 錨點 10/07 那週的週一是 10/05，這天在前一週
    // 不放行的 mockResolvedValueOnce 若沒被消費，不可漏到後面的案例
    afterEach(() => { panelConfirmWeekChange.mockReset(); panelConfirmWeekChange.mockImplementation(async () => true) })

    it('看他整月：日期在別週時先問面板；放行才切頁籤、改錨點、寫網址', async () => {
      const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-10-07' }, global: { stubs: STUBS } })
      await flushPromises()
      panelConfirmWeekChange.mockClear()
      routerReplace.mockClear()
      wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('records', 2, OTHER_WEEK_DATE)
      await flushPromises()
      expect(panelConfirmWeekChange).toHaveBeenCalledWith(OTHER_WEEK_DATE)
      expect(wrapper.find('[data-test="tab-records"]').attributes('aria-selected')).toBe('true')
      expect(routerReplace).toHaveBeenLastCalledWith({ query: { tab: 'records', date: OTHER_WEEK_DATE } })
      expect(wrapper.findComponent(ScheduleGridPanelStub).props('date')).toBe(OTHER_WEEK_DATE)
      wrapper.unmount()
    })

    it('看他整月：面板不放行（使用者選留在這週）就不切頁籤、不改錨點、不寫網址、不聚焦', async () => {
      const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-10-07' }, global: { stubs: STUBS } })
      await flushPromises()
      routerReplace.mockClear()
      panelConfirmWeekChange.mockResolvedValueOnce(false)
      wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('records', 2, OTHER_WEEK_DATE)
      await flushPromises()
      expect(panelConfirmWeekChange).toHaveBeenLastCalledWith(OTHER_WEEK_DATE)
      expect(wrapper.find('[data-test="tab-grid"]').attributes('aria-selected')).toBe('true')
      expect(wrapper.find('[data-test="tab-records"]').attributes('aria-selected')).toBe('false')
      expect(wrapper.findComponent(ScheduleGridPanelStub).props('date')).toBe('2026-10-07')
      expect(routerReplace).not.toHaveBeenCalled()
      expect(wrapper.findComponent(DetailColumnStub).props('focusDate')).toBeNull()
      wrapper.unmount()
    })

    it('匯入這天打卡：日期在別週時先問面板；放行才開匯入、改錨點並把 date 寫回網址', async () => {
      const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-10-07' }, global: { stubs: STUBS } })
      await flushPromises()
      panelConfirmWeekChange.mockClear()
      routerReplace.mockClear()
      wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('import', { employee_id: 2, employee_name: '測試員工', date: OTHER_WEEK_DATE })
      await flushPromises()
      expect(panelConfirmWeekChange).toHaveBeenCalledWith(OTHER_WEEK_DATE)
      const dialog = wrapper.findComponent(ImportPreviewDialogStub)
      expect(dialog.props('modelValue')).toBe(true)
      expect(dialog.props('month')).toBe(9)
      expect(wrapper.findComponent(ScheduleGridPanelStub).props('date')).toBe(OTHER_WEEK_DATE)
      // 錨點與網址一致（原本只改錨點不寫網址）
      expect(routerReplace).toHaveBeenLastCalledWith({ query: { date: OTHER_WEEK_DATE } })
      wrapper.unmount()
    })

    it('匯入這天打卡：面板不放行就不開匯入、不改錨點、不寫網址', async () => {
      const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-10-07' }, global: { stubs: STUBS } })
      await flushPromises()
      routerReplace.mockClear()
      panelConfirmWeekChange.mockResolvedValueOnce(false)
      wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('import', { employee_id: 2, employee_name: '測試員工', date: OTHER_WEEK_DATE })
      await flushPromises()
      expect(panelConfirmWeekChange).toHaveBeenLastCalledWith(OTHER_WEEK_DATE)
      const dialog = wrapper.findComponent(ImportPreviewDialogStub)
      expect(dialog.props('modelValue')).toBe(false)
      expect(dialog.props('sourceContext')).toBeNull()
      expect(wrapper.findComponent(ScheduleGridPanelStub).props('date')).toBe('2026-10-07')
      expect(routerReplace).not.toHaveBeenCalled()
      wrapper.unmount()
    })
  })
})

describe('頁籤與權限（SPEC-027 §8）', () => {
  afterEach(() => { mockIsMobile.value = false })
  beforeEach(() => {
    routerReplace.mockReset()
    getSummaryMock.mockReset().mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockReset().mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    getRecordsMock.mockResolvedValue({ data: [] })
  })

  const tabs = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[role="tab"]').map((t) => t.text())

  it('只有排班權限：班表核對＋輪值表＋換班紀錄＋班別設定，沒有出勤統計也不載入出勤資料', async () => {
    mockHasPermission.mockImplementation((code: unknown) => code === 'SCHEDULE')
    const wrapper = mount(ScheduleAttendanceView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(tabs(wrapper)).toEqual(['班表核對', '學期輪值表', '換班紀錄', '班別設定'])
    expect(wrapper.findComponent(WorkspaceHeaderStub).exists()).toBe(false)
    expect(wrapper.findComponent(AttendanceMonthStatsStub).exists()).toBe(false)
    expect(getSummaryMock).not.toHaveBeenCalled()
    mockHasPermission.mockReturnValue(true)
    wrapper.unmount()
  })

  it('只有排班權限：換週跨月也不打出勤 API', async () => {
    mockHasPermission.mockImplementation((code: unknown) => code === 'SCHEDULE')
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-10-26' }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('update:date', '2026-11-02')
    await flushPromises()
    expect(getSummaryMock).not.toHaveBeenCalled()
    expect(getAnomalyListMock).not.toHaveBeenCalled()
    mockHasPermission.mockReturnValue(true)
    wrapper.unmount()
  })

  it('換週、換月前先問格子面板（未儲存排班）；面板不放行就停在原週', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-10-07' }, global: { stubs: STUBS } })
    await flushPromises()
    const panel = () => wrapper.findComponent(ScheduleGridPanelStub)
    panelConfirmWeekChange.mockResolvedValueOnce(false)
    panel().vm.$emit('update:date', '2026-10-12')
    await flushPromises()
    expect(panelConfirmWeekChange).toHaveBeenLastCalledWith('2026-10-12')
    expect(panel().props('date')).toBe('2026-10-07')
    expect(routerReplace).not.toHaveBeenCalled()
    panelConfirmWeekChange.mockResolvedValueOnce(false)
    wrapper.findComponent(WorkspaceHeaderStub).vm.$emit('update:month', 11)
    await flushPromises()
    expect(panelConfirmWeekChange).toHaveBeenLastCalledWith('2026-11-01')
    expect(panel().props('date')).toBe('2026-10-07')
    panel().vm.$emit('update:date', '2026-10-12')
    await flushPromises()
    expect(panel().props('date')).toBe('2026-10-12')
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { date: '2026-10-12' } })
    wrapper.unmount()
  })

  it('view=month 傳給格子面板；面板切週／月寫回網址（切回週拿掉 view、帶 date）', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-16', view: 'month' }, global: { stubs: STUBS } })
    await flushPromises()
    const panel = wrapper.findComponent(ScheduleGridPanelStub)
    expect(panel.props('view')).toBe('month')
    expect(panel.props('month')).toBeTruthy()
    panel.vm.$emit('update:view', 'week', '2026-09-28')
    await flushPromises()
    expect(panelConfirmWeekChange).toHaveBeenCalledWith('2026-09-28')
    expect(routerReplace).toHaveBeenLastCalledWith({ query: expect.objectContaining({ date: '2026-09-28' }) })
    expect(routerReplace.mock.calls.at(-1)![0].query.view).toBeUndefined()
    wrapper.unmount()
  })

  it('手機：view=month 仍是週模式（月模式不提供）', async () => {
    mockIsMobile.value = true
    const wrapper = mount(ScheduleAttendanceView, { props: { view: 'month' }, global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('view')).toBe('week')
    wrapper.unmount()
  })

  it('切到月模式寫 view=month；週模式有未儲存排班時換月仍先問面板，被擋就不寫網址', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-16' }, global: { stubs: STUBS } })
    await flushPromises()
    const panel = () => wrapper.findComponent(ScheduleGridPanelStub)
    expect(panel().props('view')).toBe('week')
    // 單純切週／月不換週、不問緩衝
    panelConfirmWeekChange.mockClear()
    panel().vm.$emit('update:view', 'month')
    await flushPromises()
    expect(panelConfirmWeekChange).not.toHaveBeenCalled()
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { view: 'month' } })
    // 月模式的上／下個月走 update:date → 先問面板（未儲存的週排班），不放行就停在原月
    routerReplace.mockClear()
    panelConfirmWeekChange.mockResolvedValueOnce(false)
    panel().vm.$emit('update:date', '2026-10-01')
    await flushPromises()
    expect(panelConfirmWeekChange).toHaveBeenLastCalledWith('2026-10-01')
    expect(panel().props('date')).toBe('2026-09-16')
    expect(routerReplace).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('匯出月報：本月還有待處理或未匯入時先提醒；選「先去處理」就切到只看待處理，不匯出', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-10-07' }, global: { stubs: STUBS } })
    await flushPromises()
    const bar = wrapper.findComponent(MonthProgressBarStub)
    const header = wrapper.findComponent(WorkspaceHeaderStub)
    vi.mocked(downloadFile).mockClear()

    bar.vm.$emit('summary', { month: '2026-10-01', issues: 3, missingImportDays: 2 })
    msgBoxConfirm.mockRejectedValueOnce('cancel')
    header.vm.$emit('export')
    await flushPromises()
    expect(msgBoxConfirm).toHaveBeenCalledWith(expect.stringMatching(/3 格待處理.*2 天打卡還沒匯入/), '匯出 10 月月報', expect.objectContaining({ confirmButtonText: '仍要匯出', cancelButtonText: '先去處理' }))
    expect(downloadFile).not.toHaveBeenCalled()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('filter')).toBe('issues')

    msgBoxConfirm.mockResolvedValueOnce('confirm')
    header.vm.$emit('export')
    await flushPromises()
    expect(downloadFile).toHaveBeenCalledTimes(1)

    // 都處理完：直接匯出不提醒；別月的統計不拿來當這個月的
    msgBoxConfirm.mockClear()
    bar.vm.$emit('summary', { month: '2026-10-01', issues: 0, missingImportDays: 0 })
    header.vm.$emit('export')
    await flushPromises()
    bar.vm.$emit('summary', { month: '2026-09-01', issues: 9, missingImportDays: 0 })
    header.vm.$emit('export')
    await flushPromises()
    expect(msgBoxConfirm).not.toHaveBeenCalled()
    expect(downloadFile).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it('版面：月份與動作在頁首列，出勤統計只在出勤明細頁籤（不壓在格子上方）', async () => {
    mockHasFullSalaryView.mockReturnValue(true)
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-10-07' }, global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.find('.page-header .header-actions').findComponent(WorkspaceHeaderStub).exists()).toBe(true)
    expect(wrapper.findComponent(WorkspaceHeaderStub).props('canPayrollCompare')).toBe(true)
    expect(wrapper.find('[data-test="records-panel"]').findComponent(AttendanceMonthStatsStub).exists()).toBe(true)
    expect(wrapper.find('.page-header__subtitle').exists()).toBe(false)
    wrapper.findComponent(WorkspaceHeaderStub).vm.$emit('payroll')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'PayrollComparisonDialog' }).exists()).toBe(true)
    mockHasFullSalaryView.mockReturnValue(false)
    wrapper.unmount()
  })

  it('格子空狀態「匯入打卡紀錄」帶日期：跨月週開的是缺的那天所在的月（審查 F3）', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-29' }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('import-punches', '2026-10-01')
    await flushPromises()
    const dialog = wrapper.findComponent(ImportPreviewDialogStub)
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('month')).toBe(10)
    expect(dialog.props('sourceContext')).toBeNull()
    wrapper.unmount()
  })

  it('上／下個月跨年：一次換到正確的年月', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-01-14' }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(WorkspaceHeaderStub).vm.$emit('update:period', 2025, 12)
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('date')).toBe('2025-12-01')
    expect(wrapper.findComponent(WorkspaceHeaderStub).props('year')).toBe(2025)
    expect(wrapper.findComponent(WorkspaceHeaderStub).props('month')).toBe(12)
    wrapper.unmount()
  })

  it('學期輪值表切走再切回不會卸載（保留未儲存編輯）', async () => {
    mockHasPermission.mockImplementation((code: unknown) => code === 'SCHEDULE' || code === 'ATTENDANCE_READ')
    rotationMounts.count = 0
    const wrapper = mount(ScheduleAttendanceView, { global: { stubs: STUBS } })
    await flushPromises()
    await wrapper.find('[data-test="tab-rotation"]').trigger('click')
    await flushPromises()
    expect(rotationMounts.count).toBe(1)
    await wrapper.find('[data-test="tab-grid"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.rotation-stub').exists()).toBe(true)
    expect(wrapper.find('.rotation-stub').attributes('style')).toContain('display: none')
    await wrapper.find('[data-test="tab-rotation"]').trigger('click')
    await flushPromises()
    expect(rotationMounts.count).toBe(1)
    expect(wrapper.find('.rotation-stub').attributes('style') ?? '').not.toContain('display: none')
    mockHasPermission.mockReturnValue(true)
    wrapper.unmount()
  })

  it('輪值表套用後的後續處理（每日調整／逐日確認）改了資料：班表核對的格子與進度重算（D-08）', async () => {
    mockHasPermission.mockImplementation((code: unknown) => code === 'SCHEDULE' || code === 'ATTENDANCE_READ')
    const wrapper = mount(ScheduleAttendanceView, { global: { stubs: STUBS } })
    await flushPromises()
    await wrapper.find('[data-test="tab-rotation"]').trigger('click')
    await flushPromises()
    const before = wrapper.findComponent(ScheduleGridPanelStub).props('revision') as number
    wrapper.findComponent({ name: 'DutyRotationPanel' }).vm.$emit('changed')
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(before + 1)
    mockHasPermission.mockReturnValue(true)
    wrapper.unmount()
  })

  it('只有出勤權限：班表核對＋出勤明細', async () => {
    mockHasPermission.mockImplementation((code: unknown) => code === 'ATTENDANCE_READ' || code === 'ATTENDANCE_WRITE')
    const wrapper = mount(ScheduleAttendanceView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(tabs(wrapper)).toEqual(['班表核對', '出勤明細'])
    mockHasPermission.mockReturnValue(true)
    wrapper.unmount()
  })

  it('點頁籤同步網址；輪值表與換班紀錄切到才掛載', async () => {
    mockHasPermission.mockReturnValue(true)
    const wrapper = mount(ScheduleAttendanceView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.find('.swaps-stub').exists()).toBe(false)
    await wrapper.find('[data-test="tab-swaps"]').trigger('click')
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { tab: 'swaps' } })
    expect(wrapper.find('.swaps-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('匯入完成與本月進度③都切到班表核對並只看有問題', async () => {
    mockHasPermission.mockReturnValue(true)
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'records' }, global: { stubs: STUBS } })
    await flushPromises()
    await wrapper.findComponent(ImportPreviewDialogStub).vm.$emit('imported', {})
    await flushPromises()
    expect(wrapper.find('[data-test="tab-grid"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('filter')).toBe('issues')
    // 桌機切到月格子：「本月 N 格待處理」點進來看到的是同一個 N（不是本週的數字）
    expect(routerReplace).toHaveBeenCalledWith({ query: { tab: 'grid', filter: 'issues', view: 'month' } })

    await wrapper.find('[data-test="tab-records"]').trigger('click')
    wrapper.findComponent(MonthProgressBarStub).vm.$emit('show-issues')
    await flushPromises()
    expect(wrapper.find('[data-test="tab-grid"]').attributes('aria-selected')).toBe('true')
    wrapper.unmount()
  })

  it('手機沒有月格子：本月進度③只切到只看待處理', async () => {
    mockHasPermission.mockReturnValue(true)
    mockIsMobile.value = true
    try {
      const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'records' }, global: { stubs: STUBS } })
      await flushPromises()
      wrapper.findComponent(MonthProgressBarStub).vm.$emit('show-issues')
      await flushPromises()
      expect(routerReplace).toHaveBeenLastCalledWith({ query: { tab: 'grid', filter: 'issues' } })
      wrapper.unmount()
    } finally {
      mockIsMobile.value = false
    }
  })
})


describe('薪資核對入口權限', () => {
  it('有完整薪資和出勤讀權限，不需班表管理權限即可使用', async () => {
    mockHasFullSalaryView.mockReturnValue(true)
    mockHasPermission.mockImplementation((code: unknown) => code === 'SALARY_READ' || code === 'ATTENDANCE_READ')
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent(WorkspaceHeaderStub).props('canPayrollCompare')).toBe(true)
  })
  it('沒有全員薪資視野則隱藏入口', async () => {
    mockHasFullSalaryView.mockReturnValue(false)
    mockHasPermission.mockReturnValue(true)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent(WorkspaceHeaderStub).props('canPayrollCompare')).toBe(false)
  })
})


describe('明細整體空態', () => {
  it('只有成功且沒有紀錄時合併三欄，提供匯入入口', async () => {
    mockHasPermission.mockReturnValue(true)
    getSummaryMock.mockResolvedValue({ data: [] })
    getAnomalyListMock.mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('本月尚無出勤紀錄')
    expect(wrapper.find('.workspace-cols').exists()).toBe(false)
    await wrapper.findAll('button').find(button => button.text() === '匯入打卡紀錄')!.trigger('click')
    expect(wrapper.findComponent(ImportPreviewDialogStub).props('modelValue')).toBe(true)
    wrapper.unmount()
  })
  it('載入失敗顯示重試，不宣稱本月沒有資料', async () => {
    getSummaryMock.mockRejectedValue(new Error('測試失敗'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).not.toContain('本月尚無出勤紀錄')
    expect(wrapper.text()).toContain('重新載入')
    expect(wrapper.find('.workspace-cols').exists()).toBe(false)
    wrapper.unmount()
  })
})


it('跨月失敗隱藏前月三欄與統計，重試成功後恢復', async () => {
  getSummaryMock.mockResolvedValue({ data: sampleRoster })
  getAnomalyListMock.mockResolvedValue({ data: { items: sampleAnomalies, total: 2, pending: 2, confirmed: 0 } })
  const wrapper = mountView()
  await flushPromises()
  const header = wrapper.findComponent(WorkspaceHeaderStub)
  const stats = () => wrapper.findComponent(AttendanceMonthStatsStub)
  expect(stats().props('displayState')).toBe('ready')
  getSummaryMock.mockRejectedValueOnce(new Error('測試失敗'))
  await header.vm.$emit('update:month', header.props('month') === 9 ? 8 : 9)
  await flushPromises()
  expect(wrapper.find('.workspace-cols').exists()).toBe(false)
  expect(stats().props('displayState')).toBe('unavailable')
  await wrapper.findAll('button').find(button => button.text() === '重新載入')!.trigger('click')
  await flushPromises()
  expect(wrapper.find('.workspace-cols').exists()).toBe(true)
  expect(stats().props('displayState')).toBe('ready')
  wrapper.unmount()
})

it('沒有當月資料時統計不顯示舊月數字', () => {
  const wrapper = mount(AttendanceMonthStats, {
    props: { displayState: 'unavailable', kpis: { fullAttendance: 9876, lateCount: 0, missingCount: 0, pendingAnomalies: 0 } },
    global: { stubs: WH_STUBS },
  })
  expect(wrapper.text()).toContain('出勤統計尚未載入成功')
  expect(wrapper.text()).not.toContain('9876')
  wrapper.unmount()
})


it('整月無出勤紀錄仍保留從格子進入的指定人日明細', async () => {
  mockHasPermission.mockReturnValue(true)
  getSummaryMock.mockResolvedValue({ data: [] })
  getAnomalyListMock.mockResolvedValue({ data: { items: [], total: 0, pending: 0, confirmed: 0 } })
  getRecordsMock.mockResolvedValue({ data: [] })
  const wrapper = mount(ScheduleAttendanceView, { props: { date: '2026-09-10' }, global: { stubs: STUBS } })
  await flushPromises()
  await wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('records', 7, '2026-09-03')
  await flushPromises()
  const detail = wrapper.findComponent(DetailColumnStub)
  expect(detail.exists()).toBe(true)
  expect(detail.props('employeeId')).toBe(7)
  expect(detail.props('focusDate')).toBe('2026-09-03')
  expect(wrapper.find('[aria-label="出勤紀錄空狀態"]').exists()).toBe(false)
  await wrapper.findComponent(WorkspaceHeaderStub).vm.$emit('update:month', 10)
  await flushPromises()
  expect(wrapper.find('[aria-label="出勤紀錄空狀態"]').exists()).toBe(true)
  wrapper.unmount()
})


it('預設整月明細，異常清單收進抽屜且點選後關閉', async () => {
  getSummaryMock.mockResolvedValue({ data: sampleRoster })
  getAnomalyListMock.mockResolvedValue({ data: { items: sampleAnomalies, total: 2, pending: 2, confirmed: 0 } })
  const wrapper = mountView()
  await flushPromises()
  expect(wrapper.findComponent(DetailColumnStub).props('mode')).toBe('month')
  expect(wrapper.findComponent(RosterColumnStub).props('selectedEmployeeId')).toBe(wrapper.findComponent(DetailColumnStub).props('employeeId'))
  expect(wrapper.find('.workspace-cols .col-anomaly').exists()).toBe(false)
  await wrapper.findAll('button').find(button => button.text().includes('遲到・早退・缺卡清單'))!.trigger('click')
  expect(wrapper.find('[data-test="anomaly-drawer"]').attributes('data-open')).toBe('true')
  await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('select', 1)
  await flushPromises()
  expect(wrapper.find('[data-test="anomaly-drawer"]').attributes('data-open')).toBe('false')
  expect(wrapper.findComponent(DetailColumnStub).props('mode')).toBe('resolve')
  const employee = wrapper.findComponent(DetailColumnStub).props('employeeId')
  await wrapper.findComponent(DetailColumnStub).vm.$emit('switch-mode', 'month')
  await flushPromises()
  expect(wrapper.findComponent(DetailColumnStub).props('employeeId')).toBe(employee)
  wrapper.unmount()
})

it('新月份名冊不再包含原選人時回到可用員工', async () => {
  getSummaryMock.mockResolvedValue({ data: sampleRoster })
  getAnomalyListMock.mockResolvedValue({ data: { items: [], total: 0, pending: 0, confirmed: 0 } })
  const wrapper = mountView()
  await flushPromises()
  await wrapper.findComponent(RosterColumnStub).vm.$emit('select', sampleRoster[1]!.employee_id)
  await flushPromises()
  getSummaryMock.mockResolvedValue({ data: [sampleRoster[0]] })
  // 初始月份取自今天：寫死 10 會在 10 月變成同月 no-op（2026-10 起此測試即因此紅）
  const header = wrapper.findComponent(WorkspaceHeaderStub)
  await header.vm.$emit('update:month', header.props('month') === 10 ? 11 : 10)
  await flushPromises()
  expect(wrapper.findComponent(DetailColumnStub).props('employeeId')).toBe(sampleRoster[0]!.employee_id)
  wrapper.unmount()
})

describe('ScheduleAttendanceView 異常卡打卡紀錄載入狀態（QA #22）', () => {
  beforeEach(() => {
    getSummaryMock.mockReset().mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockReset().mockResolvedValue({ data: { items: sampleAnomalies, pending: 2, total: 2, confirmed: 0 } })
    getRecordsMock.mockReset()
  })

  it('打卡紀錄還在途：context 標 loading，不是缺卡', async () => {
    getRecordsMock.mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('select', 0)
    await flushPromises()
    expect(wrapper.findComponent(DetailColumnStub).props('context')).toMatchObject({ records: 'loading', punch_in: null, punch_out: null })
    wrapper.unmount()
  })

  it('載入失敗標 failed；重試成功後標 loaded 並帶出真實打卡', async () => {
    getRecordsMock.mockRejectedValueOnce(new Error('network'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('select', 0)
    await flushPromises()
    const dc = wrapper.findComponent(DetailColumnStub)
    expect(dc.props('context')).toMatchObject({ records: 'failed' })
    getRecordsMock.mockResolvedValueOnce({ data: [{ date: '2026-06-05', punch_in: '08:10', punch_out: '17:00', status: 'late' }] })
    dc.vm.$emit('retryRecords')
    await flushPromises()
    expect(dc.props('context')).toMatchObject({ records: 'loaded', punch_in: '08:10', punch_out: '17:00' })
    wrapper.unmount()
  })
})

describe('ScheduleAttendanceView 異常選取以 attendance id 為準（QA P3）', () => {
  beforeEach(() => {
    getSummaryMock.mockReset().mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockReset().mockResolvedValue({ data: { items: sampleAnomalies, pending: 2, total: 2, confirmed: 0 } })
    getRecordsMock.mockReset().mockResolvedValue({ data: [] })
  })

  it('處理後重抓順序改變：仍停在同一筆（同一人同一天），不跳到別人', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('select', 1)
    await flushPromises()
    const dc = wrapper.findComponent(DetailColumnStub)
    expect(dc.props('anomaly')).toMatchObject({ id: 11 })
    // 後端回傳順序改變（無 ORDER BY）
    getAnomalyListMock.mockResolvedValue({ data: { items: [...sampleAnomalies].reverse(), pending: 2, total: 2, confirmed: 0 } })
    dc.vm.$emit('resolved')
    await flushPromises()
    expect(dc.props('anomaly')).toMatchObject({ id: 11 })
    expect(dc.props('anomalyIndex')).toBe(0)
    expect(wrapper.findComponent(AnomalyQueueColumnStub).props('selectedIndex')).toBe(0)
    wrapper.unmount()
  })

  it('選取的那筆消失：停在原位置（夾在範圍內）', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findComponent(AnomalyQueueColumnStub).vm.$emit('select', 1)
    await flushPromises()
    getAnomalyListMock.mockResolvedValue({ data: { items: [sampleAnomalies[0]], pending: 1, total: 1, confirmed: 0 } })
    wrapper.findComponent(DetailColumnStub).vm.$emit('resolved')
    await flushPromises()
    expect(wrapper.findComponent(DetailColumnStub).props('anomaly')).toMatchObject({ id: 10 })
    wrapper.unmount()
  })
})

describe('第五輪審查：預設月份、頁首範圍、兩頁籤互通', () => {
  beforeEach(() => {
    routerReplace.mockReset()
    workingMonth.mockReset()
    openPatternsSpy.mockReset()
    mockHasPermission.mockReturnValue(true)
    getSummaryMock.mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    getRecordsMock.mockResolvedValue({ data: [] })
  })

  it('沒指定日期進頁、上個月薪資還沒封存：預設切到上個月並寫回網址', async () => {
    workingMonth.mockResolvedValue({ data: { year: 2026, month: 9, previous_unsettled: true } })
    const wrapper = mount(ScheduleAttendanceView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('date')).toBe('2026-09-01')
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { date: '2026-09-01' } })
    wrapper.unmount()
  })

  it('上個月已封存、或網址帶日期：不改月份（帶日期時連問都不問）', async () => {
    workingMonth.mockResolvedValue({ data: { year: 2026, month: 10, previous_unsettled: false } })
    const settled = mount(ScheduleAttendanceView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(routerReplace).not.toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ date: expect.any(String) }) }))
    settled.unmount()
    workingMonth.mockClear()
    const dated = mount(ScheduleAttendanceView, { props: { date: '2026-08-12' }, global: { stubs: STUBS } })
    await flushPromises()
    expect(workingMonth).not.toHaveBeenCalled()
    expect(dated.findComponent(ScheduleGridPanelStub).props('date')).toBe('2026-08-12')
    dated.unmount()
  })

  it('年月與頁首動作只在班表核對／出勤明細顯示（輪值表、換班、班別設定不受它控制）', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'rotation', date: '2026-09-16' }, global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.find('.workspace-header-stub').attributes('style') ?? '').toContain('display: none')
    await wrapper.find('[data-test="tab-records"]').trigger('click')
    expect(wrapper.find('.workspace-header-stub').attributes('style') ?? '').not.toContain('display: none')
    wrapper.unmount()
  })

  it('格子的型態註記開本月設定檢查、抽屜的重算開重算抽屜；頁首有年月時告訴面板', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'grid', date: '2026-09-16' }, global: { stubs: STUBS } })
    await flushPromises()
    const panel = wrapper.findComponent(ScheduleGridPanelStub)
    expect(panel.props('headerHasMonth')).toBe(true)
    panel.vm.$emit('show-patterns')
    expect(openPatternsSpy).toHaveBeenCalledTimes(1)
    panel.vm.$emit('recalculate')
    await flushPromises()
    expect(wrapper.findComponent(RecalcDrawerStub).props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  it('出勤明細「到班表核對處理」：切到班表核對並帶人帶日期（開那格抽屜）', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'records', date: '2026-09-16' }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(DetailColumnStub).vm.$emit('openGrid', 2, '2026-09-03')
    await flushPromises()
    expect(wrapper.find('[data-test="tab-grid"]').attributes('aria-selected')).toBe('true')
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { tab: 'grid', date: '2026-09-03', emp: '2' } })
    wrapper.unmount()
  })

  it('出勤明細寫出清單與班表核對待處理的關係（不讓兩個數字各說各話）', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'records', date: '2026-09-16' }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(MonthProgressBarStub).vm.$emit('summary', { month: '2026-09-01', issues: 435, missingImportDays: 0 })
    await flushPromises()
    expect(wrapper.get('[data-test="records-scope-note"]').text()).toContain('班表核對本月 435 格待處理中，有打卡紀錄的遲到、早退、缺卡在這裡處理')
    wrapper.unmount()
  })
})

describe('第五輪審查修正（獨立審查 F1／F4／F5）', () => {
  beforeEach(() => {
    routerReplace.mockReset()
    workingMonth.mockReset()
    mockHasPermission.mockReturnValue(true)
    getSummaryMock.mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    getRecordsMock.mockResolvedValue({ data: [] })
  })

  it('面板開過深連結抽屜後，頁面把網址的 emp 拿掉（之後換週不會再自己彈開）', async () => {
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'grid', date: '2026-09-03', emp: 2 }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(ScheduleGridPanelStub).vm.$emit('focus-handled')
    await flushPromises()
    const last = routerReplace.mock.calls.at(-1)![0] as { query: Record<string, string> }
    expect(last.query).not.toHaveProperty('emp')
    wrapper.unmount()
  })

  it('出勤明細預設看的人在處理完他的待處理後不會換成別人（換月才重選）', async () => {
    // 李小花月統計異常較多（排序在前）但沒有待處理；王小明有 1 筆待處理 → 分組後王小明是第一位
    const roster = [sampleRoster[0], { ...sampleRoster[1], late_count: 3 }]
    getSummaryMock.mockResolvedValue({ data: roster })
    getAnomalyListMock.mockResolvedValue({ data: { items: [sampleAnomalies[0]], pending: 1, total: 1, confirmed: 0 } })
    const wrapper = mount(ScheduleAttendanceView, { props: { tab: 'records', date: '2026-06-16' }, global: { stubs: STUBS } })
    await flushPromises()
    // 王小明（E001）有 1 筆待處理 → 畫面第一位、預設看他
    expect(wrapper.findComponent(DetailColumnStub).props('employeeId')).toBe(1)
    // 處理完：他的待處理變 0，名冊把他移到「無待處理」；預設的人不跟著換
    getAnomalyListMock.mockResolvedValue({ data: { items: [{ ...sampleAnomalies[0], confirmed_action: 'admin_accept' }], pending: 0, total: 1, confirmed: 1 } })
    getSummaryMock.mockResolvedValue({ data: roster.map((r) => ({ ...r })) })
    wrapper.findComponent(DetailColumnStub).vm.$emit('resolved')
    await flushPromises()
    expect(wrapper.findComponent(DetailColumnStub).props('employeeId')).toBe(1)
    wrapper.unmount()
  })

  it('預設月份的回應在離開頁面後才到：不改網址、不提示', async () => {
    let resolve!: (v: unknown) => void
    workingMonth.mockReturnValue(new Promise((r) => { resolve = r }))
    const wrapper = mount(ScheduleAttendanceView, { global: { stubs: STUBS } })
    await flushPromises()
    wrapper.unmount()
    routerReplace.mockClear()
    resolve({ data: { year: 2026, month: 9, previous_unsettled: true } })
    await flushPromises()
    expect(routerReplace).not.toHaveBeenCalled()
  })
})
