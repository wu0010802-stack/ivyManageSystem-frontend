/**
 * 排班與出勤「班別設定」頁籤（2026-10 自「設定 › 輪班別管理」搬入）。
 *
 * 鎖定：
 * - 只有 SCHEDULE 看得到頁籤；沒有 SCHEDULE 的 ?tab=shifts 退回班表核對、不掛面板
 * - 班別異動後班表核對與本月進度重算：格子面板 v-show 常駐，不 bump revision 就會停在舊班別選單
 *
 * 獨立成檔：ScheduleAttendanceView.spec.ts 正由頁面 UI/UX 改版同步修改，分檔避免合併衝突。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/attendanceMonthContext', () => ({
  getAttendanceMonthContext: vi.fn().mockResolvedValue({ data: { roster: [], days: [] } }),
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

import ScheduleAttendanceView from '../ScheduleAttendanceView.vue'

const ScheduleGridPanelStub = {
  name: 'ScheduleGridPanel',
  props: ['date', 'filter', 'focusEmployeeId', 'focusDate', 'revision'],
  template: '<div class="grid-panel-stub" />',
}
const MonthProgressBarStub = {
  name: 'MonthProgressBar',
  props: ['date', 'revision', 'mobile'],
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
}

const mountView = (props: Record<string, unknown> = {}) =>
  mount(ScheduleAttendanceView, { props: { date: '2026-09-14', ...props }, global: { stubs: STUBS } })

describe('排班與出勤：班別設定頁籤', () => {
  beforeEach(() => {
    routerReplace.mockReset()
    granted.codes = new Set(['ATTENDANCE_READ', 'SCHEDULE'])
  })

  it('有 SCHEDULE：頁籤列最後一個是「班別設定」，點了切過去並寫回 ?tab=shifts', async () => {
    const wrapper = mountView()
    await flushPromises()
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.at(-1)!.text()).toBe('班別設定')
    expect(wrapper.findComponent(ShiftTypesPanelStub).exists()).toBe(false)

    await wrapper.find('[data-test="tab-shifts"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="tab-shifts"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.findComponent(ShiftTypesPanelStub).exists()).toBe(true)
    expect(routerReplace).toHaveBeenLastCalledWith({ query: { tab: 'shifts' } })
    wrapper.unmount()
  })

  it('?tab=shifts 深連結直接開班別設定', async () => {
    const wrapper = mountView({ tab: 'shifts' })
    await flushPromises()
    expect(wrapper.find('[data-test="tab-shifts"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.findComponent(ShiftTypesPanelStub).exists()).toBe(true)
    wrapper.unmount()
  })

  it('沒有 SCHEDULE：看不到頁籤，?tab=shifts 退回班表核對且不掛面板', async () => {
    granted.codes = new Set(['ATTENDANCE_READ'])
    const wrapper = mountView({ tab: 'shifts' })
    await flushPromises()
    expect(wrapper.find('[data-test="tab-shifts"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="tab-grid"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.findComponent(ShiftTypesPanelStub).exists()).toBe(false)
    wrapper.unmount()
  })

  it('班別異動後，常駐的班表核對與本月進度都重算（否則格子的班別選單停在舊資料）', async () => {
    const wrapper = mountView({ tab: 'grid' })
    await flushPromises()
    await wrapper.setProps({ tab: 'shifts' })
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(0)

    wrapper.findComponent(ShiftTypesPanelStub).vm.$emit('changed')
    await flushPromises()
    expect(wrapper.findComponent(ScheduleGridPanelStub).props('revision')).toBe(1)
    expect(wrapper.findComponent(MonthProgressBarStub).props('revision')).toBe(1)
    wrapper.unmount()
  })
})
