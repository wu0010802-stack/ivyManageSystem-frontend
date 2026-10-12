import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ScheduleGridPanel from '../ScheduleGridPanel.vue'
import { cell, day, grid, W1, WEEK } from './gridFixtures'

const api = vi.hoisted(() => ({
  grid: vi.fn(),
  getAssignments: vi.fn(),
  saveAssignments: vi.fn(),
  saveDaily: vi.fn(),
  copyMonth: vi.fn(),
  importShifts: vi.fn(),
  download: vi.fn(),
}))
const ui = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), confirm: vi.fn() }))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: api.grid }))
vi.mock('@/api/shifts', () => ({
  getAssignments: api.getAssignments,
  saveAssignments: api.saveAssignments,
  saveDaily: api.saveDaily,
  copyMonthAssignments: api.copyMonth,
  importShifts: api.importShifts,
}))
vi.mock('@/utils/download', () => ({ downloadFile: api.download }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(false) }) }
})
vi.mock('element-plus', async (orig) => ({
  ...(await orig<typeof import('element-plus')>()),
  ElMessage: { success: ui.success, warning: ui.warning, error: ui.error },
  ElMessageBox: { confirm: ui.confirm },
}))

const assignment = (employeeId: number, shiftTypeId: number) => ({
  id: employeeId, employee_id: employeeId, employee_name: '', shift_type_id: shiftTypeId, shift_type_name: '',
  notes: '', week_start_date: W1, work_start: '07:00', work_end: '16:30',
})

const DrawerStub = { name: 'PersonDayDrawer', props: ['modelValue', 'cell'], emits: ['records', 'changed', 'update:modelValue'], template: '<div data-test="drawer-stub" />' }
const BatchStub = { name: 'BatchConfirmDialog', props: ['modelValue', 'units'], template: '<div data-test="batch-stub" />' }

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(ScheduleGridPanel, {
    props: { date: '2026-09-16', filter: 'all', ...props },
    global: {
      plugins: [ElementPlus],
      stubs: {
        PersonDayDrawer: DrawerStub,
        BatchConfirmDialog: BatchStub,
        teleport: true,
        // el-dialog 在 happy-dom 下開啟後不會渲染內容（動畫生命週期），改用只看 modelValue 的殼
        ElDialog: { name: 'ElDialog', props: ['modelValue', 'title'], template: '<section v-if="modelValue" role="dialog"><slot /><slot name="footer" /></section>' },
      },
    },
  })
}

function recordedGrid() {
  return grid({
    cells: [
      ...WEEK.map((d) => cell(1, d, { plan: { expected: day(d).is_workday } })),
      cell(2, WEEK[0], { actual: { status: 'anomaly' }, edit: { recorded: true, confirm: true, plan: false, locked_reason: 'recorded' } }),
      ...WEEK.slice(1).map((d) => cell(2, d, { plan: { expected: day(d).is_workday } })),
    ],
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  api.grid.mockResolvedValue({ data: recordedGrid() })
  api.getAssignments.mockResolvedValue({ data: [assignment(1, 1), assignment(2, 1)] })
  api.saveAssignments.mockResolvedValue({ data: { message: 'ok', week_start_date: W1, warnings: [] } })
  api.saveDaily.mockResolvedValue({ data: {} })
  ui.confirm.mockResolvedValue('confirm')
})

describe('ScheduleGridPanel', () => {
  it('載入錨點所在週，顯示格子與問題數', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(api.grid).toHaveBeenCalledWith({ start_date: W1, end_date: WEEK[6] })
    expect(wrapper.find('[data-test="shift-grid-table"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('只看有問題（1）')
  })

  it('整週改班遇到已打卡日：其餘工作日送每日調整，已打卡日開批次確認', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[1].vm.$emit('update:modelValue', 2) // 王副導
    await flushPromises()
    await wrapper.find('[data-test="toolbar-save"]').trigger('click')
    await flushPromises()
    expect(api.saveAssignments).not.toHaveBeenCalled()
    expect(api.saveDaily).toHaveBeenCalledTimes(4)
    const batch = wrapper.findComponent(BatchStub)
    expect(batch.props('modelValue')).toBe(true)
    expect(batch.props('units')).toHaveLength(1)
    expect(wrapper.emitted('changed')).toBeTruthy()
  })

  it('深連結開頁即開該人該日抽屜；抽屜「看他整月」往上轉', async () => {
    const wrapper = mountPanel({ focusEmployeeId: 2, focusDate: WEEK[0] })
    await flushPromises()
    const drawer = wrapper.findComponent(DrawerStub)
    expect(drawer.props('modelValue')).toBe(true)
    expect(drawer.props('cell')).toMatchObject({ employee_id: 2, date: WEEK[0] })
    drawer.vm.$emit('records', 2, WEEK[0])
    expect(wrapper.emitted('records')).toEqual([[2, WEEK[0]]])
  })

  it('複製上週只改緩衝；上月整月先試算再確認才寫入', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    api.getAssignments.mockResolvedValueOnce({ data: [assignment(1, 2)] })
    const dropdowns = wrapper.findAllComponents({ name: 'ElDropdown' })
    dropdowns[0].vm.$emit('click')
    await flushPromises()
    expect(api.getAssignments).toHaveBeenLastCalledWith({ week_start: '2026-09-07' })
    expect(wrapper.find('[data-test="toolbar-save"]').text()).toBe('儲存排班（1 處變更）')

    api.copyMonth
      .mockResolvedValueOnce({ data: { blocked: [], created: 3, updated: 1, weeks_paired: 4 } })
      .mockResolvedValueOnce({ data: { blocked: [], created: 3, updated: 1, weeks_paired: 4 } })
    dropdowns[0].vm.$emit('command', 'copy-prev-month')
    await flushPromises()
    expect(api.copyMonth.mock.calls.map(([body]) => [body.source_month, body.target_month, body.dry_run])).toEqual([
      [8, 9, true],
      [8, 9, false],
    ])
    expect(ui.confirm).toHaveBeenCalled()
  })

  it('匯入班表：上傳後以本週為目標，顯示成功／失敗筆數並重新載入', async () => {
    api.importShifts.mockResolvedValue({ data: { total: 3, saved: 2, failed: 1, errors: ['第 3 行: 找不到班別'] } })
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElDropdown' })[1].vm.$emit('command', 'import')
    await flushPromises()
    const upload = wrapper.findComponent({ name: 'ElUpload' })
    await (upload.props('onChange') as (f: { raw: File }) => Promise<void>)({ raw: new File(['x'], 'shifts.xlsx') })
    await flushPromises()
    expect(api.importShifts).toHaveBeenCalledWith(expect.any(FormData), W1)
    expect(wrapper.text()).toContain('共 3 筆，成功 2 筆，失敗 1 筆')
    expect(wrapper.text()).toContain('第 3 行: 找不到班別')
    expect(ui.warning).toHaveBeenCalled()
    expect(api.grid).toHaveBeenCalledTimes(2)
  })

  it('儲存後顯示週工時預警', async () => {
    api.grid.mockResolvedValue({ data: grid() })
    api.saveAssignments.mockResolvedValue({
      data: { message: 'ok', week_start_date: W1, warnings: [{ code: 'WEEKLY_HOURS', employee_id: 1, employee_name: '林班導', calculated_hours: 45, limit_hours: 40, message: '林班導本週 45 小時，超過 40 小時', week_start: W1 }] },
    })
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 2)
    await flushPromises()
    await wrapper.find('[data-test="toolbar-save"]').trigger('click')
    await flushPromises()
    expect(api.saveAssignments).toHaveBeenCalled()
    expect(wrapper.find('[data-test="weekly-warnings"]').text()).toContain('超過 40 小時')
  })

  it('匯出本週與下載範本走共用下載工具', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const io = wrapper.findAllComponents({ name: 'ElDropdown' })[1]
    io.vm.$emit('command', 'export')
    io.vm.$emit('command', 'template')
    expect(api.download).toHaveBeenCalledWith('/exports/shifts', `排班表_${W1}.xlsx`, { week_start: W1 })
    expect(api.download).toHaveBeenCalledWith('/shifts/import-template', '排班匯入範本.xlsx')
  })
})
