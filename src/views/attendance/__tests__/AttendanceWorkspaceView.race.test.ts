import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AttendanceWorkspaceView from '../AttendanceWorkspaceView.vue'

// ── deferred helper：手動控制回應時序（模擬慢請求）─────────────────────────
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

interface RecordRow {
  date: string
  punch_in: string | null
  punch_out: string | null
  status: string | null
}

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

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
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

const RosterColumnStub = {
  name: 'RosterColumn',
  props: ['roster', 'selectedEmployeeId', 'loading'],
  emits: ['select'],
  template: `<div class="roster-column-stub"><slot /></div>`,
}
const AnomalyQueueColumnStub = {
  name: 'AnomalyQueueColumn',
  props: ['items', 'selectedIndex', 'loading'],
  emits: ['select', 'filterChange'],
  template: `<div class="anomaly-queue-column-stub"><slot /></div>`,
}
const DetailColumnStub = {
  name: 'DetailColumn',
  props: ['mode', 'anomaly', 'anomalyIndex', 'anomalyTotal', 'context', 'employeeId', 'year', 'month'],
  emits: ['resolved', 'navigate', 'switchMode'],
  template: `<div class="detail-column-stub"><slot /></div>`,
}
const ImportPreviewDialogStub = {
  name: 'ImportPreviewDialog',
  props: ['modelValue', 'year', 'month'],
  emits: ['update:modelValue', 'imported'],
  template: `<div class="import-preview-dialog-stub"><slot /></div>`,
}
const WorkspaceHeaderStub = {
  name: 'WorkspaceHeader',
  props: ['year', 'month', 'kpis'],
  emits: ['update:year', 'update:month', 'import', 'export'],
  template: `<div class="workspace-header-stub"><slot /></div>`,
}

const STUBS = {
  RosterColumn: RosterColumnStub,
  AnomalyQueueColumn: AnomalyQueueColumnStub,
  DetailColumn: DetailColumnStub,
  ImportPreviewDialog: ImportPreviewDialogStub,
  WorkspaceHeader: WorkspaceHeaderStub,
  'el-tabs': { template: '<div class="el-tabs"><slot /></div>' },
  'el-tab-pane': { template: '<div class="el-tab-pane"><slot /></div>', props: ['label'] },
}

const sampleRoster = [
  { employee_id: 1, employee_name: '王小明', employee_number: 'E001', normal_days: 20, late_count: 1, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0, total_late_minutes: 10 },
  { employee_id: 2, employee_name: '李小花', employee_number: 'E002', normal_days: 22, late_count: 0, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0, total_late_minutes: 0 },
]
const sampleAnomalies = [
  { id: 10, employee_name: '王小明', employee_number: 'E001', date: '2026-06-05', weekday: '五', type: 'late', type_label: '遲到', detail: '遲到 10 分', estimated_deduction: 200, confirmed_action: null },
]

const mountView = () =>
  mount(AttendanceWorkspaceView, {
    global: { stubs: STUBS },
    attachTo: document.body,
  })

describe('AttendanceWorkspaceView 員工月記錄快取請求競態', () => {
  beforeEach(() => {
    getSummaryMock.mockReset()
    getAnomalyListMock.mockReset()
    getRecordsMock.mockReset()

    getSummaryMock.mockResolvedValue({ data: sampleRoster })
    getAnomalyListMock.mockResolvedValue({
      data: { items: sampleAnomalies, pending: 1, total: 1, confirmed: 0 },
    })
    getRecordsMock.mockResolvedValue({ data: [] })
  })

  it('同員工換月 M1(慢)→M2(快)：舊月 in-flight 回應不得回填快取', async () => {
    const m1Rows: RecordRow[] = [
      { date: '2026-01-05', punch_in: '09:00', punch_out: '18:00', status: null },
    ]
    const m2Rows: RecordRow[] = [
      { date: '2026-02-03', punch_in: '08:00', punch_out: '17:00', status: null },
    ]

    // 掛載後 refresh → currentEmployeeId 由 anomaly[0]（E001）推導成 1，watch 觸發首次 getRecords。
    // 讓這第一次（M1）成為「慢請求」——回傳一個尚未 resolve 的 promise。
    const m1 = deferred<{ data: RecordRow[] }>()
    getRecordsMock.mockReturnValueOnce(m1.promise as never)

    const wrapper = mountView()
    await flushPromises()

    // M1 已發出但仍 in-flight（快取尚未寫入）
    expect(getRecordsMock).toHaveBeenCalledTimes(1)
    const monthM1 = getRecordsMock.mock.calls[0][0].month as number
    const monthM2 = monthM1 === 12 ? 11 : monthM1 + 1

    const vm = wrapper.vm as unknown as { recordsCache: Map<number, RecordRow[]> }
    expect(vm.recordsCache.get(1)).toBeUndefined()

    // 換月 → 清快取 + 以新月份（M2）重新載入，M2 快速 resolve
    getRecordsMock.mockResolvedValueOnce({ data: m2Rows } as never)
    const header = wrapper.findComponent(WorkspaceHeaderStub)
    await header.vm.$emit('update:month', monthM2)
    await flushPromises()

    // M2 已回填
    expect(getRecordsMock).toHaveBeenCalledTimes(2)
    expect(getRecordsMock.mock.calls[1][0].month).toBe(monthM2)
    expect(vm.recordsCache.get(1)).toEqual(m2Rows)

    // 舊月 M1 的慢請求現在才 resolve —— 不得覆寫 M2 資料
    m1.resolve({ data: m1Rows })
    await flushPromises()

    expect(vm.recordsCache.get(1)).toEqual(m2Rows)
  })

  it('非競態情況：正常換月各自載入，行為不變', async () => {
    const m1Rows: RecordRow[] = [
      { date: '2026-01-05', punch_in: '09:00', punch_out: '18:00', status: null },
    ]
    const m2Rows: RecordRow[] = [
      { date: '2026-02-03', punch_in: '08:00', punch_out: '17:00', status: null },
    ]

    getRecordsMock.mockResolvedValueOnce({ data: m1Rows } as never)
    const wrapper = mountView()
    await flushPromises()

    const vm = wrapper.vm as unknown as { recordsCache: Map<number, RecordRow[]> }
    expect(vm.recordsCache.get(1)).toEqual(m1Rows)

    const monthM1 = getRecordsMock.mock.calls[0][0].month as number
    const monthM2 = monthM1 === 12 ? 11 : monthM1 + 1
    getRecordsMock.mockResolvedValueOnce({ data: m2Rows } as never)
    const header = wrapper.findComponent(WorkspaceHeaderStub)
    await header.vm.$emit('update:month', monthM2)
    await flushPromises()

    expect(vm.recordsCache.get(1)).toEqual(m2Rows)
  })
})
