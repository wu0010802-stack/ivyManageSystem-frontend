vi.mock('@/api/attendanceMonthContext', () => ({ getAttendanceMonthContext: vi.fn().mockResolvedValue({ data: { roster: [], days: [] } }) }))
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AttendanceWorkspaceView from '../AttendanceWorkspaceView.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }),
}))

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))

vi.mock('@/utils/download', () => ({
  downloadFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElTabs: { template: '<div class="el-tabs"><slot /></div>' },
  ElTabPane: { template: '<div class="el-tab-pane"><slot /></div>', props: ['label', 'name'] },
}))

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
  props: ['mode', 'anomaly', 'anomalyIndex', 'anomalyTotal', 'context', 'employeeId', 'year', 'month', 'focusDate'],
  emits: ['resolved', 'navigate', 'switchMode'],
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
  props: ['year', 'month', 'kpis', 'displayState'],
  emits: ['update:year', 'update:month', 'import', 'export'],
  template: `<div class="workspace-header-stub"><slot /><slot name="month-tools" /></div>`,
}

const ReconciliationPanelStub = { name: 'ReconciliationPanel', props: ['revision', 'active'], emits: ['records', 'import'], template: '<div />' }
const STUBS = {
  ElDrawer: { props: ['modelValue'], template: '<section data-test="anomaly-drawer" :data-open="String(modelValue)"><slot /></section>' },
  PayrollComparisonDialog: { props: ['modelValue'], template: '<div />' },
  ReconciliationPanel: ReconciliationPanelStub,
  RosterColumn: RosterColumnStub,
  AnomalyQueueColumn: AnomalyQueueColumnStub,
  DetailColumn: DetailColumnStub,
  ImportPreviewDialog: ImportPreviewDialogStub,
  WorkspaceHeader: WorkspaceHeaderStub,
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
  mount(AttendanceWorkspaceView, {
    global: { stubs: STUBS },
    attachTo: document.body,
  })

describe('AttendanceWorkspaceView', () => {
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

describe('WorkspaceHeader', () => {
  const defaultProps = {
    year: 2026,
    month: 6,
    kpis: { fullAttendance: 5, lateCount: 3, missingCount: 1, pendingAnomalies: 2 },
  }

  it('點「匯入」按鈕 emit import 事件', async () => {
    const wrapper = mount(WorkspaceHeader, {
      props: defaultProps,
      global: { stubs: WH_STUBS },
    })
    const importBtn = wrapper.findAll('button').find(b => b.text().includes('匯入'))
    expect(importBtn).toBeDefined()
    await importBtn!.trigger('click')
    expect(wrapper.emitted('import')).toBeTruthy()
  })

  it('點「匯出月報」按鈕 emit export 事件', async () => {
    const wrapper = mount(WorkspaceHeader, {
      props: defaultProps,
      global: { stubs: WH_STUBS },
    })
    const exportBtn = wrapper.findAll('button').find(b => b.text().includes('匯出'))
    expect(exportBtn).toBeDefined()
    await exportBtn!.trigger('click')
    expect(wrapper.emitted('export')).toBeTruthy()
  })

  it('渲染 pendingAnomalies KPI', () => {
    const wrapper = mount(WorkspaceHeader, {
      props: defaultProps,
      global: { stubs: WH_STUBS },
    })
    expect(wrapper.text()).toContain('待處理異常')
  })

  it('權限 gate：hasPermission 回 false 時「匯入」按鈕不顯示（canWrite=false）', () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = mount(WorkspaceHeader, {
      props: defaultProps,
      global: { stubs: WH_STUBS },
    })
    const importBtn = wrapper.findAll('button').find((b) => b.text().includes('匯入'))
    expect(importBtn).toBeUndefined()
    // 匯出按鈕不受權限限制，應仍可見
    const exportBtn = wrapper.findAll('button').find((b) => b.text().includes('匯出'))
    expect(exportBtn).toBeDefined()
    // 重設，避免污染後續 test
    mockHasPermission.mockReturnValue(true)
  })
})

describe('核對跨月明細導向', () => {
  it('完全沒有紀錄時可在該月份開啟補匯入', async () => {
    getSummaryMock.mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    getRecordsMock.mockResolvedValue({ data: [] })
    const wrapper = mount(AttendanceWorkspaceView, { props: { initialDate: '2026-09-06', defaultReconcile: true }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(ReconciliationPanelStub).vm.$emit('import', { employee_id: 2, employee_name: '測試員工', date: '2026-08-31' })
    await flushPromises()
    const dialog = wrapper.findComponent(ImportPreviewDialogStub)
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('month')).toBe(8)
    expect(dialog.props('sourceContext')).toEqual({ employee_id: 2, employee_name: '測試員工', date: '2026-08-31' })
    wrapper.unmount()
  })
  it('?tab= 深連結在已停留於本頁時仍切換頁籤，且隱藏的核對面板標記為非啟用', async () => {
    getSummaryMock.mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    getRecordsMock.mockResolvedValue({ data: [] })
    // 先以 tab=records（defaultReconcile=false）進頁，再導到 tab=reconcile：
    // router props function 會重算 props，頁籤必須跟著換（過去只有 date 會生效）。
    const wrapper = mount(AttendanceWorkspaceView, { props: { defaultReconcile: true }, global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.findComponent(ReconciliationPanelStub).props('active')).toBe(true)

    await wrapper.setProps({ defaultReconcile: false })
    await flushPromises()
    // 面板以 v-show 常駐保留核對狀態，但必須標成非啟用，避免背景重跑 preview
    expect(wrapper.findComponent(ReconciliationPanelStub).props('active')).toBe(false)

    await wrapper.setProps({ defaultReconcile: true })
    await flushPromises()
    expect(wrapper.findComponent(ReconciliationPanelStub).props('active')).toBe(true)
    wrapper.unmount()
  })

  it('依所點人日的月份載入該員工明細', async () => {
    getSummaryMock.mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    getRecordsMock.mockResolvedValue({ data: [] })
    const wrapper = mount(AttendanceWorkspaceView, { props: { initialDate: '2026-09-06', defaultReconcile: true }, global: { stubs: STUBS } })
    await flushPromises()
    wrapper.findComponent(ReconciliationPanelStub).vm.$emit('records', { employee_id: 2, date: '2026-08-31' })
    await flushPromises()
    // 切到該人日所屬月份的整月明細；實際打卡列由 EmployeeMonthPanel 依這幾個 prop
    // 自行載入（2026-09-11 起父層不再重複抓同一支 /attendance/records）。
    const detail = wrapper.findComponent(DetailColumnStub)
    expect(detail.props('mode')).toBe('month')
    expect(detail.props('employeeId')).toBe(2)
    expect(detail.props('year')).toBe(2026)
    expect(detail.props('month')).toBe(8)
    expect(detail.props('focusDate')).toBe('2026-08-31')
    await wrapper.findComponent(DetailColumnStub).vm.$emit('resolved')
    await flushPromises()
    expect(wrapper.findComponent(ReconciliationPanelStub).props('revision')).toBe(1)
    await wrapper.findComponent(WorkspaceHeaderStub).vm.$emit('update:month', 9)
    await flushPromises()
    expect(wrapper.findComponent(DetailColumnStub).props('focusDate')).toBeNull()
    wrapper.unmount()
  })
})


describe('薪資核對入口權限', () => {
  it('有完整薪資和出勤讀權限，不需班表管理權限即可使用', async () => {
    mockHasFullSalaryView.mockReturnValue(true)
    mockHasPermission.mockImplementation((code: unknown) => code === 'SALARY_READ' || code === 'ATTENDANCE_READ')
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('薪資扣項核對')
  })
  it('沒有全員薪資視野則隱藏入口', async () => {
    mockHasFullSalaryView.mockReturnValue(false)
    mockHasPermission.mockReturnValue(true)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).not.toContain('薪資扣項核對')
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
  expect(header.props('displayState')).toBe('ready')
  getSummaryMock.mockRejectedValueOnce(new Error('測試失敗'))
  await header.vm.$emit('update:month', header.props('month') === 9 ? 8 : 9)
  await flushPromises()
  expect(wrapper.find('.workspace-cols').exists()).toBe(false)
  expect(header.props('displayState')).toBe('unavailable')
  await wrapper.findAll('button').find(button => button.text() === '重新載入')!.trigger('click')
  await flushPromises()
  expect(wrapper.find('.workspace-cols').exists()).toBe(true)
  expect(header.props('displayState')).toBe('ready')
  wrapper.unmount()
})

it('沒有當月資料時統計不顯示舊月數字', () => {
  const wrapper = mount(WorkspaceHeader, {
    props: { year: 2026, month: 9, displayState: 'unavailable', kpis: { fullAttendance: 9876, lateCount: 0, missingCount: 0, pendingAnomalies: 0 } },
    global: { stubs: WH_STUBS },
  })
  expect(wrapper.text()).toContain('出勤統計尚未載入成功')
  expect(wrapper.text()).not.toContain('9876')
  expect(wrapper.find('[aria-label="月結工具"]').text()).toContain('匯出月報')
  wrapper.unmount()
})


it('整月無出勤紀錄仍保留從核對進入的指定人日明細', async () => {
  mockHasPermission.mockReturnValue(true)
  getSummaryMock.mockResolvedValue({ data: [] })
  getAnomalyListMock.mockResolvedValue({ data: { items: [], total: 0, pending: 0, confirmed: 0 } })
  getRecordsMock.mockResolvedValue({ data: [] })
  const wrapper = mount(AttendanceWorkspaceView, { props: { initialDate: '2026-09-10', defaultReconcile: true }, global: { stubs: STUBS } })
  await flushPromises()
  await wrapper.findComponent(ReconciliationPanelStub).vm.$emit('records', { employee_id: 7, date: '2026-09-03' })
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
  await wrapper.findAll('button').find(button => button.text().includes('待處理異常'))!.trigger('click')
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
  await wrapper.findComponent(WorkspaceHeaderStub).vm.$emit('update:month', 10)
  await flushPromises()
  expect(wrapper.findComponent(DetailColumnStub).props('employeeId')).toBe(sampleRoster[0]!.employee_id)
  wrapper.unmount()
})
