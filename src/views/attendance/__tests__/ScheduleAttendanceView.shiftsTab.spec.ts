/**
 * 排班與出勤「排班 › 班別設定」子頁籤（2026-10 自「設定 › 輪班別管理」搬入；2026-10-24 頁籤收成核對／排班兩個後成為排班的子頁籤）。
 *
 * 鎖定：
 * - 只有 SCHEDULE 看得到排班頁籤；沒有 SCHEDULE 的 ?tab=shifts 退回核對、不掛面板
 * - 班別異動後核對格子與本月進度重算：格子面板 v-show 常駐，不 bump revision 就會停在舊班別選單
 *
 * 獨立成檔：ScheduleAttendanceView.spec.ts 正由頁面 UI/UX 改版同步修改，分檔避免合併衝突。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/attendanceMonthContext', () => ({
  getAttendanceMonthContext: vi.fn().mockResolvedValue({ data: { roster: [], days: [] } }),
  getAttendanceWorkingMonth: vi.fn().mockResolvedValue({ data: { year: 2026, month: 9, previous_unsettled: false } }),
}))

const routerReplace = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/api/attendance', () => ({
  getSummary: vi.fn().mockResolvedValue({ data: [] }),
  getAnomalyList: vi.fn().mockResolvedValue({ data: { items: [], pending: 0, total: 0, confirmed: 0 } }),
  getRecords: vi.fn().mockResolvedValue({ data: [] }),
  batchConfirmAnomalies: vi.fn().mockResolvedValue({ data: {} }),
  upsertRecord: vi.fn().mockResolvedValue({ data: {} }),
}))

const granted = vi.hoisted(() => ({ codes: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (code: string) => granted.codes.has(code),
  hasFullSalaryView: () => false,
}))

vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(false), cleanup: () => {} }) }
})
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: vi.fn() }) }))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn().mockResolvedValue(undefined) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// 頁面建立的整月格子（useMonthGrid）走這支 API；用呼叫次數斷言「資料異動後整月資料重抓」
const monthApi = vi.hoisted(() => ({ grid: vi.fn(async () => ({ data: null })) }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: monthApi.grid }))

import ScheduleAttendanceView from '../ScheduleAttendanceView.vue'
import { attendanceRouteProps } from '@/router/attendanceRouteProps'

const ScheduleGridPanelStub = {
  name: 'ScheduleGridPanel',
  props: ['mode', 'date', 'filter', 'focusEmployeeId', 'focusDate', 'revision'],
  template: '<div class="grid-panel-stub" />',
}
/** 排班子頁籤是 el-radio-group（按鈕樣式）：按鈕點了請群組送出 update:modelValue */
const RadioGroupStub = {
  name: 'ElRadioGroup',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  provide() { return { pickRadio: (v: string) => (this as unknown as { $emit: (e: string, v: string) => void }).$emit('update:modelValue', v) } },
  template: '<div role="radiogroup" :data-value="modelValue"><slot /></div>',
}
const RadioButtonStub = { props: ['value'], inject: ['pickRadio'], template: '<button type="button" @click="pickRadio(value)"><slot /></button>' }
const MonthProgressBarStub = {
  name: 'MonthProgressBar',
  props: ['month', 'mobile'],
  template: '<div class="month-progress-stub" />',
}
const ShiftTypesPanelStub = {
  name: 'ShiftTypesPanel',
  emits: ['changed'],
  template: '<div class="shift-types-stub" />',
}
const STUBS = {
  ScheduleGridPanel: ScheduleGridPanelStub,
  MonthProgressBar: MonthProgressBarStub,
  ShiftTypesPanel: ShiftTypesPanelStub,
  DutyRotationPanel: { template: '<div />' },
  SwapHistoryPanel: { template: '<div />' },
  WorkspaceHeader: { template: '<div />' },
  AttendanceMonthStats: { template: '<div />' },
  RosterColumn: { template: '<div />' },
  DetailColumn: { template: '<div />' },
  AnomalyQueueColumn: { template: '<div />' },
  ImportPreviewDialog: { template: '<div />' },
  PayrollComparisonDialog: { template: '<div />' },
  ElDrawer: { template: '<div />' },
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-radio-group': RadioGroupStub,
  'el-radio-button': RadioButtonStub,
}

const mountView = (props: Record<string, unknown> = {}) =>
  mount(ScheduleAttendanceView, { props: { date: '2026-09-14', ...props }, global: { stubs: STUBS } })

describe('排班與出勤：排班 › 班別設定', () => {
  beforeEach(() => {
    routerReplace.mockReset()
    granted.codes = new Set(['ATTENDANCE_READ', 'SCHEDULE'])
  })

  it('有 SCHEDULE：排班頁籤的子頁籤最後一個是「班別設定」，點了切過去並寫回 ?tab=schedule&sub=shifts', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).toEqual(['核對', '排班'])
    await wrapper.find('[data-test="tab-schedule"]').trigger('click')
    await flushPromises()
    const subs = wrapper.get('[data-test="schedule-sub"]').findAll('button')
    expect(subs.at(-1)!.text()).toBe('班別設定')
    expect(wrapper.findComponent(ShiftTypesPanelStub).exists()).toBe(false)

    await wrapper.find('[data-test="schedule-sub-shifts"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="schedule-sub"]').attributes('data-value')).toBe('shifts')
    expect(wrapper.findComponent(ShiftTypesPanelStub).exists()).toBe(true)
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { tab: 'schedule', sub: 'shifts' } })
    wrapper.unmount()
  })

  it('?tab=shifts 深連結（含 /settings?tab=shifts 轉來的）直接開排班 › 班別設定', async () => {
    const wrapper = mountView(attendanceRouteProps({ tab: 'shifts' }))
    await flushPromises()
    expect(wrapper.find('[data-test="tab-schedule"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[data-test="schedule-sub"]').attributes('data-value')).toBe('shifts')
    expect(wrapper.findComponent(ShiftTypesPanelStub).exists()).toBe(true)
    wrapper.unmount()
  })

  it('沒有 SCHEDULE：看不到排班頁籤，?tab=shifts 退回核對且不掛面板', async () => {
    granted.codes = new Set(['ATTENDANCE_READ'])
    const wrapper = mountView(attendanceRouteProps({ tab: 'shifts' }))
    await flushPromises()
    expect(wrapper.find('[data-test="tab-schedule"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="tab-grid"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.findComponent(ShiftTypesPanelStub).exists()).toBe(false)
    wrapper.unmount()
  })

  it('班別異動後，常駐的核對格子與本月進度都重算（否則格子的班別選單停在舊資料）', async () => {
    const wrapper = mountView({ tab: 'grid' })
    await flushPromises()
    await wrapper.setProps(attendanceRouteProps({ tab: 'shifts' }))
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(0)

    const monthCallsBefore = monthApi.grid.mock.calls.length
    wrapper.findComponent(ShiftTypesPanelStub).vm.$emit('changed')
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(1)
    expect(monthApi.grid.mock.calls.length).toBe(monthCallsBefore + 1)
    wrapper.unmount()
  })
})
