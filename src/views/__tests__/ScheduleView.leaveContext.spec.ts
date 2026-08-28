/**
 * ScheduleView 請假整合（2026-08-28）。
 *
 * 鎖定：
 * - 載入週檢視同時抓 GET /shifts/leave-context（週一～週日整週）
 * - 週概覽條顯示每日請假（姓名＋時段＋假別；pending 帶「待審」標記）
 * - 空班警示：唯一排班者請假 → 該班別當日報「無人上班」（approved）／
 *   「待審通過將無人」（pending）
 * - 員工列姓名旁帶請假 tag
 * - 每日調整 dialog 逐日標出該員工的假別＋時段
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const {
  mockGetAssignments,
  mockSaveAssignments,
  mockCopyMonth,
  mockGetDaily,
  mockSaveDaily,
  mockDeleteDaily,
  mockGetRoster,
  mockGetSwapHistory,
  mockImportShifts,
  mockGetTemplate,
  mockExportShifts,
  mockGetLeaveContext,
} = vi.hoisted(() => ({
  mockGetAssignments: vi.fn(),
  mockSaveAssignments: vi.fn(),
  mockCopyMonth: vi.fn(),
  mockGetDaily: vi.fn(),
  mockSaveDaily: vi.fn(),
  mockDeleteDaily: vi.fn(),
  mockGetRoster: vi.fn(),
  mockGetSwapHistory: vi.fn(),
  mockImportShifts: vi.fn(),
  mockGetTemplate: vi.fn(),
  mockExportShifts: vi.fn(),
  mockGetLeaveContext: vi.fn(),
}))

vi.mock('@/api/shifts', () => ({
  getAssignments: mockGetAssignments,
  saveAssignments: mockSaveAssignments,
  copyMonthAssignments: mockCopyMonth,
  getDaily: mockGetDaily,
  saveDaily: mockSaveDaily,
  deleteDaily: mockDeleteDaily,
  getScheduleRoster: mockGetRoster,
  getSwapHistory: mockGetSwapHistory,
  getShiftImportTemplate: mockGetTemplate,
  importShifts: mockImportShifts,
  exportShifts: mockExportShifts,
  getLeaveContext: mockGetLeaveContext,
}))

const { mockMessage, mockConfirm } = vi.hoisted(() => ({
  mockMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  mockConfirm: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: mockMessage,
  ElMessageBox: { confirm: mockConfirm },
}))

const shiftTypesRef = ref([
  { id: 3, name: '早值', work_start: '08:00', work_end: '17:00', is_active: true },
  { id: 4, name: '次值', work_start: '08:30', work_end: '18:00', is_active: true },
])
vi.mock('@/stores/shift', () => ({
  useShiftStore: () => ({
    activeShiftTypes: shiftTypesRef,
    fetchShiftTypes: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
  }),
}))

vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: ref(false) }),
}))

vi.mock('@/composables', () => ({
  useClientTableFilter: (opts: { source: () => unknown[] }) => ({
    searchQuery: ref(''),
    filtered: { value: opts.source() },
    total: ref(0),
    shown: ref(0),
  }),
}))

import ScheduleView from '../ScheduleView.vue'

const getMonday = (d: Date) => {
  const dd = new Date(d)
  const day = dd.getDay()
  dd.setDate(dd.getDate() - day + (day === 0 ? -6 : 1))
  return dd
}
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MONDAY = fmt(getMonday(new Date()))
const SUNDAY = (() => {
  const d = getMonday(new Date())
  d.setDate(d.getDate() + 6)
  return fmt(d)
})()

const ElTableStub = {
  props: ['data'],
  provide() {
    return { getRows: () => (this as unknown as { data: unknown[] }).data }
  },
  template: '<div class="tbl"><slot /></div>',
}
const ElTableColumnStub = {
  props: ['label', 'prop', 'width', 'align', 'minWidth', 'fixed', 'showOverflowTooltip'],
  inject: ['getRows'],
  template: `
    <div class="col" :data-label="label">
      <div v-for="(row, i) in getRows()" :key="i" class="cell">
        <slot :row="row" :$index="i">{{ prop ? row[prop] : '' }}</slot>
      </div>
    </div>`,
}
const ElSelectStub = {
  props: ['modelValue', 'placeholder', 'clearable'],
  emits: ['update:modelValue'],
  template: '<div class="sel" :data-value="String(modelValue)"><slot /></div>',
}

const globalConfig = {
  stubs: {
    'el-table': ElTableStub,
    'el-table-column': ElTableColumnStub,
    'el-select': ElSelectStub,
    'el-option': { props: ['label', 'value'], template: '<div class="opt" :data-value="String(value)">{{ label }}</div>' },
    'el-button': {
      props: ['type', 'loading', 'icon', 'size'],
      emits: ['click'],
      template: '<button @click="$emit(\'click\')"><slot /></button>',
    },
    'el-dropdown': { template: '<div class="dropdown"><slot /><slot name="dropdown" /></div>' },
    'el-dropdown-menu': { template: '<div><slot /></div>' },
    'el-dropdown-item': {
      props: ['disabled'],
      emits: ['click'],
      template: '<button class="dd-item" @click="$emit(\'click\')"><slot /></button>',
    },
    'el-dialog': {
      props: ['modelValue', 'title', 'width'],
      template:
        '<div v-if="modelValue" class="dlg" :data-title="title"><slot /><slot name="footer" /></div>',
    },
    'el-alert': {
      props: ['title', 'type', 'closable'],
      emits: ['close'],
      template: '<div class="alert" :data-type="type"><b>{{ title }}</b><slot /></div>',
    },
    'el-upload': {
      props: ['onChange', 'autoUpload', 'accept', 'drag', 'showFileList', 'disabled'],
      template: '<div class="upload"><slot /></div>',
    },
    'el-card': { template: '<div class="card"><slot /></div>' },
    'el-tabs': { props: ['modelValue'], emits: ['update:modelValue', 'tab-change'], template: '<div><slot /></div>' },
    'el-tab-pane': { props: ['label', 'name'], template: '<section><slot /></section>' },
    'el-date-picker': { props: ['modelValue'], emits: ['update:modelValue', 'change'], template: '<input class="dp" />' },
    'el-tag': { props: ['type', 'size'], template: '<span class="tag"><slot /></span>' },
    'el-tooltip': { template: '<span><slot /></span>' },
    'el-icon': { template: '<i><slot /></i>' },
    'el-empty': { props: ['description'], template: '<div class="empty">{{ description }}</div>' },
  },
}

const ROSTER = [
  { id: 1, name: '王一', classroom_id: 5, classroom_name: '小熊班', staff_role_category: 'teacher_certified', title_name: '教師', is_active: true, hire_date: '2024-08-01', resign_date: null },
  { id: 2, name: '李二', classroom_id: 6, classroom_name: '小兔班', staff_role_category: null, title_name: null, is_active: true, hire_date: null, resign_date: null },
]

const makeLeave = (over: Record<string, unknown> = {}) => ({
  id: 71,
  employee_id: 1,
  employee_name: '王一',
  leave_type: 'sick',
  leave_type_label: '病假',
  start_date: MONDAY,
  end_date: MONDAY,
  start_time: null,
  end_time: null,
  status: 'approved',
  ...over,
})

const mountView = async () => {
  const wrapper = mount(ScheduleView, { global: globalConfig })
  await flushPromises()
  return wrapper
}

describe('ScheduleView 請假整合', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRoster.mockResolvedValue({ data: ROSTER })
    // 王一週指派早值（id 3）；李二未指派
    mockGetAssignments.mockResolvedValue({
      data: [{ employee_id: 1, shift_type_id: 3, notes: null }],
    })
    mockGetSwapHistory.mockResolvedValue({ data: [] })
    mockGetDaily.mockResolvedValue({ data: [] })
    mockGetLeaveContext.mockResolvedValue({ data: [] })
  })

  it('載入週檢視時以整週範圍呼叫 leave-context', async () => {
    await mountView()
    expect(mockGetLeaveContext).toHaveBeenCalledWith({
      start_date: MONDAY,
      end_date: SUNDAY,
    })
  })

  it('概覽條顯示請假姓名／時段／假別，唯一排班者全天假 → 該班別報無人上班', async () => {
    mockGetLeaveContext.mockResolvedValue({ data: [makeLeave()] })
    const wrapper = await mountView()
    const strip = wrapper.find('[data-test="leave-strip"]')
    expect(strip.exists()).toBe(true)
    expect(strip.text()).toContain('王一')
    expect(strip.text()).toContain('全天')
    expect(strip.text()).toContain('病假')
    expect(strip.text()).toContain('早值')
    expect(strip.text()).toContain('無人上班')
  })

  it('時段假顯示起訖時間；與班別時段無重疊則不報空班', async () => {
    mockGetLeaveContext.mockResolvedValue({
      data: [makeLeave({ start_time: '17:30', end_time: '19:00' })],
    })
    const wrapper = await mountView()
    const strip = wrapper.find('[data-test="leave-strip"]')
    expect(strip.text()).toContain('17:30~19:00')
    expect(strip.text()).not.toContain('無人上班')
  })

  it('pending 假單帶「待審」標記，空班警示措辭為待審通過將無人', async () => {
    mockGetLeaveContext.mockResolvedValue({ data: [makeLeave({ status: 'pending' })] })
    const wrapper = await mountView()
    const strip = wrapper.find('[data-test="leave-strip"]')
    expect(strip.text()).toContain('待審')
    expect(strip.text()).toContain('待審通過將無人')
    expect(strip.text()).not.toContain('無人上班')
  })

  it('本週有請假的員工列帶請假 tag；沒請假的不帶', async () => {
    mockGetLeaveContext.mockResolvedValue({ data: [makeLeave()] })
    const wrapper = await mountView()
    const tags = wrapper.findAll('[data-test="row-leave-tag"]')
    expect(tags).toHaveLength(1)
  })

  it('每日調整 dialog 逐日標出該員工假別＋時段', async () => {
    mockGetLeaveContext.mockResolvedValue({
      data: [makeLeave({ start_time: '08:00', end_time: '12:00' })],
    })
    const wrapper = await mountView()
    const adjustBtn = wrapper.findAll('button').find((b) => b.text() === '調整')
    await adjustBtn!.trigger('click')
    await flushPromises()
    const dlg = wrapper.find('[data-title="每日排班調整 (調班/換班)"]')
    expect(dlg.exists()).toBe(true)
    expect(dlg.text()).toContain('病假')
    expect(dlg.text()).toContain('08:00~12:00')
  })

  it('leave-context 載入失敗顯示錯誤但不擋名冊與排班主流程', async () => {
    mockGetLeaveContext.mockRejectedValue(new Error('boom'))
    const wrapper = await mountView()
    expect(mockMessage.error).toHaveBeenCalled()
    expect(wrapper.text()).toContain('王一')
  })
})
