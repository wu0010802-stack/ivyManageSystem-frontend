/**
 * ScheduleView 回歸（排班重設計 P0）。
 *
 * 鎖定：
 * - 名冊改走 GET /shifts/roster（權限解耦＋classroom_name 由後端填值）；
 *   班級欄不再因全量員工 API 缺欄位而整欄「-」
 * - saveAll 接住後端 warnings 並呈現；失敗不得顯示成功
 * - 匯入結果讀 `saved`（不是 upserted → 不再出現 undefined）
 * - 整月複製走後端端點：dry_run 預覽 → 確認 → 套用；封存阻擋即中止
 * - 每日調整整週 7 天（含週末）；三態：繼承／指定班別／day_off 明確排休
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

// shiftStore：storeToRefs 需要 ref 屬性（toRaw 後 isRef 才會被收進 refs）
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

// ── 與本週相關的日期（元件以「今天所在週的週一」為預設） ──
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

// ── scoped-slot 版 el-table stub（讓 cell 模板與按鈕真的渲染） ──
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
    'el-tag': { props: ['type', 'size'], template: '<span><slot /></span>' },
    'el-icon': { template: '<i><slot /></i>' },
    'el-empty': { props: ['description'], template: '<div class="empty">{{ description }}</div>' },
  },
}

const ROSTER = [
  { id: 1, name: '王一', classroom_id: 5, classroom_name: '小熊班', staff_role_category: 'teacher_certified', title_name: '教師', is_active: true, hire_date: '2024-08-01', resign_date: null },
  { id: 2, name: '李二', classroom_id: 6, classroom_name: null, staff_role_category: null, title_name: null, is_active: true, hire_date: null, resign_date: null },
  { id: 9, name: '無班級者', classroom_id: null, classroom_name: null, staff_role_category: 'office', title_name: null, is_active: true, hire_date: null, resign_date: null },
]

const mountView = async () => {
  const wrapper = mount(ScheduleView, { global: globalConfig })
  await flushPromises()
  return wrapper
}

describe('ScheduleView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRoster.mockResolvedValue({ data: ROSTER })
    mockGetAssignments.mockResolvedValue({ data: [] })
    mockGetSwapHistory.mockResolvedValue({ data: [] })
    mockGetDaily.mockResolvedValue({ data: [] })
    mockGetLeaveContext.mockResolvedValue({ data: [] })
    mockSaveDaily.mockResolvedValue({ data: {} })
    mockDeleteDaily.mockResolvedValue({ data: {} })
    mockSaveAssignments.mockResolvedValue({ data: { message: 'ok', week_start_date: MONDAY } })
  })

  it('名冊走 /shifts/roster；classroom_name 正常顯示、無班級者被排除', async () => {
    const wrapper = await mountView()
    expect(mockGetRoster).toHaveBeenCalledTimes(1)
    const text = wrapper.text()
    expect(text).toContain('王一')
    expect(text).toContain('小熊班')
    expect(text).toContain('李二')
    expect(text).not.toContain('無班級者') // 只列有班級指派者
  })

  it('saveAll 接住並顯示後端週工時 warnings', async () => {
    mockSaveAssignments.mockResolvedValue({
      data: {
        message: 'ok',
        week_start_date: MONDAY,
        warnings: [
          { code: 'WEEKLY_HOURS_EXCEEDED', employee_id: 1, employee_name: '王一', week_start: MONDAY, calculated_hours: 45, limit_hours: 40, message: '王一 本週排班工時 45.0 小時，超過勞基法上限 40 小時' },
        ],
      },
    })
    const wrapper = await mountView()
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === '儲存排班')
    await saveBtn!.trigger('click')
    await flushPromises()
    const alert = wrapper.find('[data-test="weekly-warnings"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('王一 本週排班工時 45.0 小時')
    expect(mockMessage.warning).toHaveBeenCalled()
    expect(mockMessage.success).not.toHaveBeenCalled()
  })

  it('saveAll 失敗不得顯示成功', async () => {
    mockSaveAssignments.mockRejectedValue(new Error('boom'))
    const wrapper = await mountView()
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === '儲存排班')
    await saveBtn!.trigger('click')
    await flushPromises()
    expect(mockMessage.error).toHaveBeenCalled()
    expect(mockMessage.success).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="weekly-warnings"]').exists()).toBe(false)
  })

  it('匯入結果讀 saved（不再是 undefined）', async () => {
    mockImportShifts.mockResolvedValue({
      data: { total: 3, saved: 2, failed: 1, errors: ['第 2 行: 找不到員工'] },
    })
    const wrapper = await mountView()
    const importBtn = wrapper.findAll('button').find((b) => b.text() === '匯入班表')
    await importBtn!.trigger('click')
    const upload = wrapper.findComponent('.upload') as unknown as { props: (k: string) => (f: unknown) => Promise<void> }
    await upload.props('onChange')({ raw: new File([''], 'x.xlsx') })
    await flushPromises()
    expect(mockMessage.warning).toHaveBeenCalled()
    const msg = String(mockMessage.warning.mock.calls[0][0])
    expect(msg).toContain('成功 2 筆')
    expect(msg).not.toContain('undefined')
  })

  it('整月複製：dry_run 預覽 → 確認 → 套用', async () => {
    mockCopyMonth
      .mockResolvedValueOnce({ data: { applied: false, mode: 'overwrite', source_month: '', target_month: '', weeks_paired: 4, created: 3, updated: 1, skipped: 0, blocked: [] } })
      .mockResolvedValueOnce({ data: { applied: true, mode: 'overwrite', source_month: '', target_month: '', weeks_paired: 4, created: 3, updated: 1, skipped: 0, blocked: [] } })
    mockConfirm.mockResolvedValue('confirm')
    const wrapper = await mountView()
    const item = wrapper.findAll('.dd-item').find((b) => b.text().includes('複製上月整月'))
    await item!.trigger('click')
    await flushPromises()
    expect(mockCopyMonth).toHaveBeenCalledTimes(2)
    expect(mockCopyMonth.mock.calls[0][0].dry_run).toBe(true)
    expect(mockCopyMonth.mock.calls[1][0].dry_run).toBe(false)
    const successMsg = String(mockMessage.success.mock.calls.at(-1)?.[0] ?? '')
    expect(successMsg).toContain('新增 3')
  })

  it('整月複製：封存阻擋即中止、不進行套用', async () => {
    mockCopyMonth.mockResolvedValueOnce({
      data: { applied: false, mode: 'overwrite', source_month: '', target_month: '', weeks_paired: 4, created: 1, updated: 0, skipped: 0, blocked: ['王一 2026 年 10 月薪資已封存'] },
    })
    const wrapper = await mountView()
    const item = wrapper.findAll('.dd-item').find((b) => b.text().includes('複製上月整月'))
    await item!.trigger('click')
    await flushPromises()
    expect(mockCopyMonth).toHaveBeenCalledTimes(1)
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockMessage.error).toHaveBeenCalled()
    expect(String(mockMessage.error.mock.calls[0][0])).toContain('已封存')
  })

  describe('每日調整（三態、整週 7 天）', () => {
    const openDialog = async () => {
      const wrapper = await mountView()
      const adjustBtn = wrapper.findAll('button').find((b) => b.text() === '調整')
      await adjustBtn!.trigger('click')
      await flushPromises()
      return wrapper
    }

    it('查詢整週（end=週日）且渲染 7 天', async () => {
      const wrapper = await openDialog()
      expect(mockGetDaily).toHaveBeenCalledWith({
        start_date: MONDAY,
        end_date: SUNDAY,
        employee_id: 1,
      })
      const dlg = wrapper.find('.dlg[data-title="每日排班調整 (調班/換班)"]')
      expect(dlg.exists()).toBe(true)
      // 對話框內表格 7 列（每列一個班別下拉）
      expect(dlg.findAll('.sel').length).toBe(7)
    })

    it('選「休假」送出 day_off=true', async () => {
      const wrapper = await openDialog()
      // 透過 stub 元件 emit 三態哨兵值 -1（對話框內第一列＝週一）
      const selectComp = wrapper
        .findAllComponents(ElSelectStub as never)
        .find((c) => (c.element as HTMLElement).closest('.dlg') !== null)
      selectComp!.vm.$emit('update:modelValue', -1)
      await flushPromises()
      expect(mockSaveDaily).toHaveBeenCalledWith({
        employee_id: 1,
        day_off: true,
        date: MONDAY,
      })
    })

    it('清除既有調整＝刪列恢復繼承', async () => {
      mockGetDaily.mockResolvedValue({
        data: [
          { id: 99, employee_id: 1, employee_name: '王一', shift_type_id: null, shift_type_name: '', work_start: '', work_end: '', date: MONDAY, notes: '' },
        ],
      })
      const wrapper = await openDialog()
      const selectComp = wrapper
        .findAllComponents(ElSelectStub as never)
        .find((c) => (c.element as HTMLElement).closest('.dlg') !== null)
      // 排休列顯示哨兵值 -1
      expect((selectComp!.element as HTMLElement).getAttribute('data-value')).toBe('-1')
      selectComp!.vm.$emit('update:modelValue', null)
      await flushPromises()
      expect(mockDeleteDaily).toHaveBeenCalledWith(99)
      expect(mockSaveDaily).not.toHaveBeenCalled()
    })
  })
})
