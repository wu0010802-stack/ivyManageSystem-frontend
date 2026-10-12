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

  it('抽屜「看他整月」先關抽屜再往上轉（append-to-body 抽屜不關會蓋住切換後的明細頁籤）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.find(`[data-test="cell-1-${WEEK[1]}"]`).trigger('click')
    await flushPromises()
    const drawer = wrapper.findComponent(DrawerStub)
    expect(drawer.props('modelValue')).toBe(true)
    drawer.vm.$emit('records', 1, WEEK[1])
    await flushPromises()
    expect(drawer.props('modelValue')).toBe(false)
    expect(wrapper.emitted('records')).toEqual([[1, WEEK[1]]])
  })

  it('可排班者週末沒人排班也顯示 7 欄，且點週六的格子會開抽屜', async () => {
    const wrapper = mountPanel() // 預設 caller.can_edit_plan 為真、週末無人 expected
    await flushPromises()
    expect(wrapper.find(`[data-test="day-${WEEK[5]}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="day-${WEEK[6]}"]`).exists()).toBe(true)
    await wrapper.find(`[data-test="cell-1-${WEEK[5]}"]`).trigger('click')
    await flushPromises()
    const drawer = wrapper.findComponent(DrawerStub)
    expect(drawer.props('modelValue')).toBe(true)
    expect(drawer.props('cell')).toMatchObject({ employee_id: 1, date: WEEK[5] })
  })

  it('不能排班的人（只有出勤權限）週末沒人排班時仍只顯示平日', async () => {
    api.grid.mockResolvedValue({
      data: grid({ caller: { can_view_attendance: true, can_edit_plan: false, can_confirm: false, can_edit_attendance: true } }),
    })
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find(`[data-test="day-${WEEK[4]}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="day-${WEEK[5]}"]`).exists()).toBe(false)
  })

  it('只有出勤權限（取不到週排班）：空班警示由每格計畫推算，不因週排班全空而誤報（審查 P4）', async () => {
    const wed = WEEK[2]
    const cells = [
      ...WEEK.map((d) => cell(1, d, { plan: { expected: day(d).is_workday, source: 'weekly', shift_type_id: 1 } })),
      ...WEEK.map((d) =>
        d === wed
          ? cell(2, d, {
              plan: { expected: true, source: 'daily', shift_type_id: 1 },
              leaves: [{ leave_id: 9, leave_type_label: '特休', status: 'approved', is_full_day: true, start_time: null, end_time: null }],
            })
          : cell(2, d, { plan: { expected: day(d).is_workday, source: 'weekly', shift_type_id: 1 } }),
      ),
    ]
    const reader = { can_view_attendance: true, can_edit_plan: false, can_confirm: false, can_edit_attendance: true }
    api.grid.mockResolvedValue({ data: grid({ cells, caller: reader }) })
    const wrapper = mountPanel()
    await flushPromises()
    expect(api.getAssignments).not.toHaveBeenCalled()
    expect(wrapper.find(`[data-test="gap-${wed}"]`).exists()).toBe(false)

    // 反向：靠週排班的早車人員全請假，沒有週排班資料時也要報得出來（不漏報）
    const allOut = [
      cell(1, wed, {
        plan: { expected: true, source: 'weekly', shift_type_id: 1 },
        leaves: [{ leave_id: 8, leave_type_label: '特休', status: 'approved', is_full_day: true, start_time: null, end_time: null }],
      }),
      cell(2, wed, { plan: { expected: true, source: 'weekly', shift_type_id: 1 }, leaves: [{ leave_id: 9, leave_type_label: '特休', status: 'approved', is_full_day: true, start_time: null, end_time: null }] }),
    ]
    api.grid.mockResolvedValue({ data: grid({ cells: allOut, caller: reader }) })
    const missed = mountPanel()
    await flushPromises()
    expect(missed.find(`[data-test="gap-${wed}"]`).text()).toContain('早車無人上班')
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

  it('儲存途中換週：不開批次確認（舊週的結果不顯示在新週）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[1].vm.$emit('update:modelValue', 2)
    await flushPromises()
    // 每日調整都已送出、units 已組好，卡在儲存收尾的重新載入；換週發生在這段 await 期間
    // （若換週發生在寫入途中，composable 會回 cancelled 且不帶 units，測不到此守衛）
    let release: () => void = () => {}
    api.grid.mockReturnValueOnce(new Promise((resolve) => { release = () => resolve({ data: recordedGrid() }) }))
    await wrapper.find('[data-test="toolbar-save"]').trigger('click')
    await flushPromises()
    expect(api.saveDaily).toHaveBeenCalledTimes(4)
    await wrapper.setProps({ date: '2026-09-21' })
    await flushPromises()
    release()
    await flushPromises()
    expect(wrapper.findComponent(BatchStub).props('modelValue')).toBe(false)
  })

  it('複製指定週：未選來源週時送出鈕停用；選 2026-09-02 後以 8/31 那週為來源', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    api.getAssignments.mockResolvedValueOnce({ data: [assignment(1, 2)] })
    wrapper.findAllComponents({ name: 'ElDropdown' })[0].vm.$emit('command', 'copy-week')
    await flushPromises()
    const submit = () => wrapper.findAll('button').find((b) => b.text() === '複製到本週')!
    expect(submit().attributes('disabled')).toBeDefined()
    const pickers = wrapper.findAllComponents({ name: 'ElDatePicker' })
    pickers[pickers.length - 1].vm.$emit('update:modelValue', '2026-09-02')
    await flushPromises()
    expect(submit().attributes('disabled')).toBeUndefined()
    await submit().trigger('click')
    await flushPromises()
    expect(api.getAssignments).toHaveBeenLastCalledWith({ week_start: '2026-08-31' })
    expect(wrapper.find('[data-test="toolbar-save"]').text()).toBe('儲存排班（1 處變更）')
  })
})
