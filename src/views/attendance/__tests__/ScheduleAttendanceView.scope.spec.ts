/**
 * 排班獨立成 /schedule（後台 IA 重整 S3，2026-10-29）：同一個 ScheduleAttendanceView 以 scope prop 鎖定顯示哪一半。
 *
 * - scope=schedule（/schedule）：只有排班（週班表、輪值表、換班紀錄、班別設定）；沒有頁首月份／月底作業、
 *   核對的格子與逐人、名冊與異常佇列；不打出勤名冊 API；網址只寫 sub／date（不寫 tab=schedule）。
 * - scope=attendance（/attendance）：只有核對；頁首 6 個動作（匯入、月底作業 4 項、主要動作）都在這頁。
 * - 排班頁抽屜的「看他整月」→ 到 /attendance 逐人（帶人帶日期）；/attendance?view=person&emp= 開頁就選取該人。
 * - 沒帶 scope＝舊的合併行為（既有 ScheduleAttendanceView.spec 等仍用它）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/attendanceMonthContext', () => ({
  getAttendanceMonthContext: vi.fn().mockResolvedValue({ data: { roster: [], days: [] } }),
  getAttendanceWorkingMonth: vi.fn().mockResolvedValue({ data: { year: 2026, month: 9, previous_unsettled: false } }),
}))

const routerReplace = vi.hoisted(() => vi.fn())
const routerPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useRoute: () => ({ query: { tab: 'schedule', sub: 'rotation', date: '2026-09-14' } }),
}))

const api = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getAnomalyList: vi.fn(),
}))
vi.mock('@/api/attendance', () => ({
  getSummary: (...a: unknown[]) => api.getSummary(...a),
  getAnomalyList: (...a: unknown[]) => api.getAnomalyList(...a),
  getRecords: vi.fn().mockResolvedValue({ data: [] }),
  batchConfirmAnomalies: vi.fn().mockResolvedValue({ data: {} }),
  upsertRecord: vi.fn().mockResolvedValue({ data: {} }),
}))

const granted = vi.hoisted(() => ({ codes: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (code: string) => granted.codes.has(code),
  hasFullSalaryView: () => true,
}))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(false), cleanup: () => {} }) }
})
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: vi.fn() }) }))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn().mockResolvedValue(undefined) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))
const monthApi = vi.hoisted(() => ({ grid: vi.fn(async () => ({ data: null })) }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: monthApi.grid }))

import ScheduleAttendanceView from '../ScheduleAttendanceView.vue'
import { attendancePageProps, schedulePageProps } from '@/router/attendanceRouteProps'

const GridStub = {
  name: 'ScheduleGridPanel',
  props: ['mode', 'date', 'filter', 'focusEmployeeId', 'focusDate', 'revision', 'view', 'month'],
  emits: ['records', 'import', 'changed', 'update:date', 'update:filter', 'show-patterns', 'recalculate'],
  methods: { confirmWeekChange: async () => true, openFirstIssue: () => true },
  template: '<div class="grid-panel-stub" :data-mode="mode" />',
}
const RadioGroupStub = {
  name: 'ElRadioGroup',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  provide() { return { pickRadio: (v: string) => (this as unknown as { $emit: (e: string, v: string) => void }).$emit('update:modelValue', v) } },
  template: '<div role="radiogroup" :data-value="modelValue"><slot /></div>',
}
const RadioButtonStub = { props: ['value'], inject: ['pickRadio'], template: '<button type="button" :data-value="value" @click="pickRadio(value)"><slot /></button>' }
const RosterStub = { name: 'RosterColumn', props: ['roster', 'selectedEmployeeId'], template: '<div class="roster-stub" />' }
const DetailStub = { name: 'DetailColumn', props: ['employeeId', 'focusDate', 'mode'], template: '<div class="detail-stub" />' }
const STUBS = {
  ScheduleGridPanel: GridStub,
  MonthProgressBar: { name: 'MonthProgressBar', props: ['month', 'mobile'], methods: { openPatterns: () => {} }, template: '<div class="month-progress-stub" />' },
  ShiftTypesPanel: { name: 'ShiftTypesPanel', emits: ['changed'], template: '<div class="shift-types-stub" />' },
  DutyRotationPanel: { template: '<div class="rotation-stub" />' },
  SwapHistoryPanel: { template: '<div class="swaps-stub" />' },
  WorkspaceHeader: { name: 'WorkspaceHeader', template: '<div class="workspace-header-stub" />' },
  RosterColumn: RosterStub,
  DetailColumn: DetailStub,
  AnomalyQueueColumn: { template: '<div />' },
  ImportPreviewDialog: { template: '<div />' },
  PayrollComparisonDialog: { template: '<div />' },
  AppraisalSheetBatchDialog: { template: '<div />' },
  RecalculateAttendanceDrawer: { template: '<div />' },
  ElDrawer: { template: '<div />' },
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-radio-group': RadioGroupStub,
  'el-radio-button': RadioButtonStub,
}

const mountPage = (props: Record<string, unknown>) =>
  mount(ScheduleAttendanceView, { props: { date: '2026-09-14', ...props }, global: { stubs: STUBS }, attachTo: document.body })
const roster = [
  { employee_id: 7, employee_name: '王小明', employee_number: 'E007', normal_days: 20, late_count: 0, early_leave_count: 0, missing_punch_in: 0, missing_punch_out: 0, total_late_minutes: 0 },
]

describe('ScheduleAttendanceView — scope 鎖定', () => {
  beforeEach(() => {
    routerReplace.mockReset()
    routerPush.mockReset()
    api.getSummary.mockReset().mockResolvedValue({ data: roster })
    api.getAnomalyList.mockReset().mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } })
    monthApi.grid.mockClear()
    granted.codes = new Set(['ATTENDANCE_READ', 'ATTENDANCE_WRITE', 'SCHEDULE', 'SALARY_READ'])
  })

  describe('scope=schedule（/schedule）', () => {
    const props = () => ({ ...schedulePageProps({ sub: 'rotation' }) })

    it('只有排班：標題「排班」、不畫頁籤列、沒有頁首月份動作、沒有核對的檢視切換與逐人', async () => {
      const w = mountPage(props())
      await flushPromises()
      expect(w.text()).toContain('排班')
      expect(w.text()).not.toContain('出勤核對')
      expect(w.find('[data-test="tab-grid"]').exists()).toBe(false)
      expect(w.find('[data-test="tab-schedule"]').exists()).toBe(false)
      expect(w.find('.workspace-header-stub').exists()).toBe(false)
      expect(w.find('[data-test="reconcile-view"]').exists()).toBe(false)
      expect(w.find('[data-test="records-panel"]').exists()).toBe(false)
      expect(w.find('[data-test="schedule-sub"]').exists()).toBe(true)
      expect(w.get('[data-test="schedule-sub"]').attributes('data-value')).toBe('rotation')
    })

    it('即使持有 ATTENDANCE_READ 也不打出勤名冊／異常 API（那是核對的）', async () => {
      mountPage(props())
      await flushPromises()
      expect(api.getSummary).not.toHaveBeenCalled()
      expect(api.getAnomalyList).not.toHaveBeenCalled()
    })

    it('排班面板：週班表是 plan 面板、只掛 plan（沒有 reconcile 面板）', async () => {
      const w = mountPage({ ...schedulePageProps({}) })
      await flushPromises()
      const modes = w.findAllComponents(GridStub).map((c) => c.props('mode'))
      expect(modes).toEqual(['plan'])
    })

    it('切子頁籤：網址只寫 sub（不寫 tab=schedule）', async () => {
      const w = mountPage(props())
      await flushPromises()
      await w.get('[data-test="schedule-sub-swaps"]').trigger('click')
      expect(routerReplace).toHaveBeenLastCalledWith({ query: { sub: 'swaps', date: '2026-09-14' } })
    })

    it('週班表抽屜「看他整月」→ 到 /attendance 逐人，帶人帶日期（逐人明細屬出勤核對頁）', async () => {
      const w = mountPage({ ...schedulePageProps({}) })
      await flushPromises()
      w.getComponent(GridStub).vm.$emit('records', 7, '2026-09-10')
      await flushPromises()
      expect(routerPush).toHaveBeenCalledWith({
        path: '/attendance',
        query: { tab: 'grid', view: 'person', date: '2026-09-10', emp: '7' },
      })
    })

    it('只有 SCHEDULE（沒有 ATTENDANCE_READ）一樣可用：排班頁仍是排班', async () => {
      granted.codes = new Set(['SCHEDULE'])
      const w = mountPage(props())
      await flushPromises()
      expect(w.find('[data-test="schedule-sub"]').exists()).toBe(true)
      expect(w.find('.workspace-header-stub').exists()).toBe(false)
    })

    it('沒有 SCHEDULE：什麼排班內容都不畫（權限沒有因 scope 放寬）', async () => {
      granted.codes = new Set(['ATTENDANCE_READ'])
      const w = mountPage(props())
      await flushPromises()
      expect(w.find('[data-test="schedule-sub"]').exists()).toBe(false)
      expect(w.findAllComponents(GridStub)).toHaveLength(0)
    })
  })

  describe('scope=attendance（/attendance）', () => {
    const props = () => ({ ...attendancePageProps({}) })

    it('只有核對：標題「出勤核對」、不畫頁籤列、有頁首月份動作與檢視切換、沒有排班子頁籤與 plan 面板', async () => {
      const w = mountPage(props())
      await flushPromises()
      expect(w.text()).toContain('出勤核對')
      expect(w.find('[data-test="tab-grid"]').exists()).toBe(false)
      expect(w.find('.workspace-header-stub').exists()).toBe(true)
      expect(w.find('[data-test="reconcile-view"]').exists()).toBe(true)
      expect(w.find('[data-test="schedule-sub"]').exists()).toBe(false)
      expect(w.findAllComponents(GridStub).every((c) => c.props('mode') === 'reconcile')).toBe(true)
      expect(api.getSummary).toHaveBeenCalledTimes(1)
    })

    it('即使持有 SCHEDULE 也看不到排班（排班在 /schedule）', async () => {
      const w = mountPage(props())
      await flushPromises()
      expect(w.find('.rotation-stub').exists()).toBe(false)
      expect(w.find('.shift-types-stub').exists()).toBe(false)
    })

    it('?view=person&emp=7：開頁就選取該人並聚焦那天，並把 emp 從網址拿掉（免得切回格子又彈抽屜）', async () => {
      const w = mountPage({ ...attendancePageProps({ view: 'person', emp: '7', date: '2026-09-10' }) })
      await flushPromises()
      expect(w.getComponent(DetailStub).props('employeeId')).toBe(7)
      expect(w.getComponent(DetailStub).props('focusDate')).toBe('2026-09-10')
      expect(routerReplace).toHaveBeenCalled()
      const lastQuery = (routerReplace.mock.calls.at(-1)?.[0] as { query: Record<string, string> }).query
      expect(lastQuery.emp).toBeUndefined()
    })
  })

  describe('沒帶 scope（舊合併行為）', () => {
    it('兩個頁籤依權限都在', async () => {
      const w = mountPage({})
      await flushPromises()
      expect(w.find('[data-test="tab-grid"]').exists()).toBe(true)
      expect(w.find('[data-test="tab-schedule"]').exists()).toBe(true)
      expect(w.text()).toContain('排班與出勤')
    })
  })
})
