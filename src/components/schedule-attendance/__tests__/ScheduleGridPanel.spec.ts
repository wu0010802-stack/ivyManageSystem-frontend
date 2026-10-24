import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ScheduleGridPanel from '../ScheduleGridPanel.vue'
import { useMonthGrid } from '@/composables/useMonthGrid'
import { monthRange } from '@/utils/scheduleAttendanceGrid'
import { cell, day, employee, grid, W1, WEEK } from './gridFixtures'

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
// 抓出面板註冊的路由守衛（面板是頁面的子元件，onBeforeRouteLeave/Update 掛在同一筆路由紀錄上）
const routeGuards = vi.hoisted(() => ({ leave: null as null | (() => unknown), update: null as null | ((to: { query: Record<string, unknown> }) => unknown) }))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (cb: () => unknown) => { routeGuards.leave = cb },
  onBeforeRouteUpdate: (cb: (to: { query: Record<string, unknown> }) => unknown) => { routeGuards.update = cb },
}))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: api.grid }))
vi.mock('@/api/shifts', () => ({
  getAssignments: api.getAssignments,
  saveAssignments: api.saveAssignments,
  saveDaily: api.saveDaily,
  copyMonthAssignments: api.copyMonth,
  importShifts: api.importShifts,
}))
vi.mock('@/utils/download', () => ({ downloadFile: api.download }))
// 裝置寬度：掛載前改 value（元件 setup 時才讀）；beforeEach 還原
const device = vi.hoisted(() => ({ mobile: false }))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(device.mobile) }) }
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

const drawerRequestClose = vi.hoisted(() => vi.fn(async () => true))
const DrawerStub = {
  name: 'PersonDayDrawer',
  props: ['modelValue', 'cell', 'weeklyShiftId', 'day', 'employeeNames', 'nav', 'actionsLocked', 'pattern', 'patternMatchesDay'],
  emits: ['records', 'changed', 'update:modelValue', 'navigate', 'back', 'patterns', 'recalculate', 'undone'],
  methods: { requestClose: () => drawerRequestClose() },
  template: '<div data-test="drawer-stub" />',
}
const BatchStub = { name: 'BatchConfirmDialog', props: ['modelValue', 'units'], template: '<div data-test="batch-stub" />' }

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(ScheduleGridPanel, {
    props: { mode: 'reconcile', date: '2026-09-16', filter: 'all', ...props },
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
  device.mobile = false
  api.grid.mockResolvedValue({ data: recordedGrid() })
  api.getAssignments.mockResolvedValue({ data: [assignment(1, 1), assignment(2, 1)] })
  api.saveAssignments.mockResolvedValue({ data: { message: 'ok', week_start_date: W1, warnings: [] } })
  api.saveDaily.mockResolvedValue({ data: {} })
  ui.confirm.mockResolvedValue('confirm')
  drawerRequestClose.mockResolvedValue(true)
})

describe('ScheduleGridPanel', () => {
  it('核對月模式：工具列換月送出 update:date（頁面據此先問未儲存的週排班）', async () => {
    api.grid.mockResolvedValue({ data: grid() })
    api.getAssignments.mockResolvedValue({ data: [] })
    const month = effectScope().run(() => useMonthGrid(ref('2026-09-16'), ref(0)))!
    const wrapper = mountPanel({ view: 'month', month })
    await flushPromises()
    const toolbar = wrapper.findComponent({ name: 'GridToolbar' })
    expect(toolbar.props('view')).toBe('month')
    toolbar.vm.$emit('update:date', '2026-10-01')
    expect(wrapper.emitted('update:date')).toEqual([['2026-10-01']])
  })

  it('排班只有週檢視：頁面給了 view=month 與整月資料也畫週格子', async () => {
    api.grid.mockResolvedValue({ data: grid() })
    api.getAssignments.mockResolvedValue({ data: [] })
    const month = effectScope().run(() => useMonthGrid(ref('2026-09-16'), ref(0)))!
    const wrapper = mountPanel({ mode: 'plan', view: 'month', month })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MonthGrid' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ShiftGrid' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'GridToolbar' }).props('view')).toBe('week')
  })

  it('mode 往下傳給工具列與格子', async () => {
    for (const mode of ['reconcile', 'plan'] as const) {
      const wrapper = mountPanel({ mode })
      await flushPromises()
      expect(wrapper.findComponent({ name: 'GridToolbar' }).props('mode')).toBe(mode)
      expect(wrapper.findComponent({ name: 'ShiftGrid' }).props('mode')).toBe(mode)
    }
  })

  it('核對：沒有本週班別下拉、空班警示、排班工具；工具列下方有狀態圖例', async () => {
    const wrapper = mountPanel({ mode: 'reconcile' })
    await flushPromises()
    expect(wrapper.find('[data-test^="weekly-"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-schedule"]').exists()).toBe(false)
    expect(wrapper.find('[data-test^="gap-"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="verdict-legend"]')).toHaveLength(1)
    // 判定照舊
    expect(wrapper.get(`[data-test="cell-2-${WEEK[0]}"]`).text()).toContain('出勤異常')
  })

  it('核對月模式：圖例只出現一次（月格子自己有含請假的圖例）', async () => {
    api.grid.mockResolvedValue({ data: grid() })
    api.getAssignments.mockResolvedValue({ data: [] })
    const month = effectScope().run(() => useMonthGrid(ref('2026-09-16'), ref(0)))!
    const wrapper = mountPanel({ view: 'month', month })
    await flushPromises()
    expect(wrapper.findAll('[data-test="verdict-legend"]')).toHaveLength(1)
    expect(wrapper.find('[data-test="verdict-legend-leave"]').exists()).toBe(true)
  })

  it('排班：格子沒有判定字，有本週班別下拉與排班工具，沒有圖例', async () => {
    const wrapper = mountPanel({ mode: 'plan' })
    await flushPromises()
    expect(wrapper.find('[data-test="weekly-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="toolbar-schedule"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="verdict-legend"]').exists()).toBe(false)
    expect(wrapper.get(`[data-test="cell-2-${WEEK[0]}"]`).text()).not.toContain('出勤異常')
    expect(wrapper.text()).not.toContain('只看待處理')
  })

  it('排班：抽屜不給待處理佇列導覽，處理完也不自動跳格', async () => {
    const wrapper = mountPanel({ mode: 'plan' })
    await flushPromises()
    await wrapper.find(`[data-test="cell-2-${WEEK[0]}"]`).trigger('click')
    await flushPromises()
    const drawer = wrapper.findComponent(DrawerStub)
    expect(drawer.props('modelValue')).toBe(true)
    expect(drawer.props('nav')).toBeNull()
    drawer.vm.$emit('changed')
    await flushPromises()
    expect(drawer.props('cell')).toMatchObject({ employee_id: 2, date: WEEK[0] })
    expect(drawer.props('actionsLocked')).toBe(false)
  })

  it('載入錨點所在週，顯示格子與問題數', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(api.grid).toHaveBeenCalledWith({ start_date: W1, end_date: WEEK[6] })
    expect(wrapper.find('[data-test="shift-grid-table"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('只看待處理（本週 1）')
  })

  it('整週改班遇到已打卡日：其餘工作日送每日調整，已打卡日開批次確認', async () => {
    const wrapper = mountPanel({ mode: 'plan' })
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
    await flushPromises() // 先問抽屜有沒有未送出的原因
    expect(wrapper.emitted('records')).toEqual([[2, WEEK[0]]])
  })

  it('深連結只開一次：開過就通知頁面清掉網址的 emp；之後再帶同一格（出勤明細再按一次）會重開', async () => {
    const wrapper = mountPanel({ focusEmployeeId: 2, focusDate: WEEK[0] })
    await flushPromises()
    expect(wrapper.emitted('focus-handled')).toHaveLength(1)
    const drawer = wrapper.findComponent(DrawerStub)
    drawer.vm.$emit('update:modelValue', false)
    // 頁面清掉 emp → 面板收到 null；換週不會再自己開
    await wrapper.setProps({ focusEmployeeId: null, focusDate: null })
    await wrapper.setProps({ date: WEEK[2] })
    await flushPromises()
    expect(drawer.props('modelValue')).toBe(false)
    expect(wrapper.emitted('focus-handled')).toHaveLength(1)
    // 同一格再帶一次（出勤明細第二次按「到班表核對處理」）
    await wrapper.setProps({ focusEmployeeId: 2, focusDate: WEEK[0] })
    await flushPromises()
    expect(drawer.props('modelValue')).toBe(true)
    expect(wrapper.emitted('focus-handled')).toHaveLength(2)
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
    const wrapper = mountPanel({ mode: 'plan' })
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
    const missed = mountPanel({ mode: 'plan' })
    await flushPromises()
    expect(missed.find(`[data-test="gap-${wed}"]`).text()).toContain('早車無人上班')
  })

  it('工具列搜尋框的關鍵字會過濾格子（姓名或工號）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('[data-test="row-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="row-2"]').exists()).toBe(true)
    await wrapper.find('[data-test="toolbar-keyword"]').setValue('E002')
    await flushPromises()
    expect(wrapper.find('[data-test="row-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="row-2"]').exists()).toBe(true)
    await wrapper.find('[data-test="toolbar-keyword"]').setValue('沒有這個人')
    await flushPromises()
    expect(wrapper.text()).toContain('找不到符合的人員')
  })

  it('換週後載入失敗：顯示載入失敗與重新載入，不再畫上一週的格子（審查 P3）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find(`[data-test="cell-1-${WEEK[0]}"]`).exists()).toBe(true)
    api.grid.mockRejectedValue(new Error('500'))
    await wrapper.setProps({ date: '2026-09-23' })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('載入失敗')
    expect(wrapper.find('[role="alert"] button').text()).toContain('重新載入')
    expect(wrapper.text()).toContain('9/21～9/27') // 工具列顯示新週
    expect(wrapper.find('[data-test="shift-grid-table"]').exists()).toBe(false)
    expect(wrapper.find(`[data-test="cell-1-${WEEK[0]}"]`).exists()).toBe(false)
  })

  it('複製上週遇到已停用班別：略過並提示（QA P3）', async () => {
    const wrapper = mountPanel({ mode: 'plan' })
    await flushPromises()
    api.getAssignments.mockResolvedValueOnce({ data: [assignment(1, 3), assignment(2, 2)] })
    wrapper.findAllComponents({ name: 'ElDropdown' })[0].vm.$emit('command', 'copy-prev-week')
    await flushPromises()
    expect(ui.warning).toHaveBeenCalledWith(expect.stringContaining('1 人的班別已停用'))
    expect(wrapper.find('[data-test="toolbar-save"]').text()).toBe('儲存排班（1 處變更）')
  })

  it('複製上週只改緩衝；上月整月先試算再確認才寫入', async () => {
    const wrapper = mountPanel({ mode: 'plan' })
    await flushPromises()
    api.getAssignments.mockResolvedValueOnce({ data: [assignment(1, 2)] })
    const dropdowns = wrapper.findAllComponents({ name: 'ElDropdown' })
    dropdowns[0].vm.$emit('command', 'copy-prev-week')
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
    const wrapper = mountPanel({ mode: 'plan' })
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElDropdown' })[0].vm.$emit('command', 'import')
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
    const wrapper = mountPanel({ mode: 'plan' })
    await flushPromises()
    wrapper.findAllComponents({ name: 'ElSelect' })[0].vm.$emit('update:modelValue', 2)
    await flushPromises()
    await wrapper.find('[data-test="toolbar-save"]').trigger('click')
    await flushPromises()
    expect(api.saveAssignments).toHaveBeenCalled()
    expect(wrapper.find('[data-test="weekly-warnings"]').text()).toContain('超過 40 小時')
  })

  it('匯出本週與下載範本走共用下載工具', async () => {
    const wrapper = mountPanel({ mode: 'plan' })
    await flushPromises()
    const io = wrapper.findAllComponents({ name: 'ElDropdown' })[0]
    io.vm.$emit('command', 'export')
    io.vm.$emit('command', 'template')
    expect(api.download).toHaveBeenCalledWith('/exports/shifts', `排班表_${W1}.xlsx`, { week_start: W1 })
    expect(api.download).toHaveBeenCalledWith('/shifts/import-template', '排班匯入範本.xlsx')
  })

  it('儲存途中換週：不開批次確認（舊週的結果不顯示在新週）', async () => {
    const wrapper = mountPanel({ mode: 'plan' })
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

  it('「看他整月」先問抽屜（打了一半的原因要確認）；抽屜不放行就留在原地（審查 F5）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    await wrapper.find(`[data-test="cell-1-${WEEK[1]}"]`).trigger('click')
    await flushPromises()
    drawerRequestClose.mockResolvedValueOnce(false)
    wrapper.findComponent(DrawerStub).vm.$emit('records', 1, WEEK[1])
    await flushPromises()
    expect(wrapper.emitted('records')).toBeUndefined()
    expect(wrapper.findComponent(DrawerStub).props('modelValue')).toBe(true)
  })

  it('複製指定週：未選來源週時送出鈕停用；選 2026-09-02 後以 8/31 那週為來源', async () => {
    const wrapper = mountPanel({ mode: 'plan' })
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

  describe('未儲存的週班別不會無聲消失', () => {
    type PanelApi = { confirmWeekChange: (date: string) => Promise<boolean> }
    const saveText = (w: ReturnType<typeof mountPanel>) => w.find('[data-test="toolbar-save"]').text()

    async function mountWithPendingEdit() {
      const wrapper = mountPanel({ mode: 'plan' })
      await flushPromises()
      wrapper.findAllComponents({ name: 'ElSelect' })[1].vm.$emit('update:modelValue', 2) // 王副導
      await flushPromises()
      expect(saveText(wrapper)).toBe('儲存排班（1 處變更）')
      return wrapper
    }

    it('換到別週前先確認；取消就回 false 並保留變更', async () => {
      const wrapper = await mountWithPendingEdit()
      ui.confirm.mockRejectedValueOnce('cancel')
      expect(await (wrapper.vm as unknown as PanelApi).confirmWeekChange('2026-09-23')).toBe(false)
      expect(ui.confirm).toHaveBeenCalledWith(expect.stringContaining('1 處'), '未儲存的排班', expect.anything())
      // 在核對頁籤換週時也是問這個面板：寫明變更在排班頁籤
      expect(ui.confirm.mock.calls[0][0]).toContain('排班頁籤這週有 1 處排班變更還沒儲存')
      expect(saveText(wrapper)).toBe('儲存排班（1 處變更）')
    })

    it('確認捨棄才清掉緩衝；同一週或沒有變更都不詢問', async () => {
      const wrapper = await mountWithPendingEdit()
      const panel = wrapper.vm as unknown as PanelApi
      expect(await panel.confirmWeekChange('2026-09-18')).toBe(true) // 同一週（9/14–9/20）
      expect(ui.confirm).not.toHaveBeenCalled()
      expect(await panel.confirmWeekChange('2026-09-23')).toBe(true)
      expect(ui.confirm).toHaveBeenCalledTimes(1)
      await flushPromises()
      // 沒有變更時儲存鈕不出現
      expect(wrapper.find('[data-test="toolbar-save"]').exists()).toBe(false)
      expect(await panel.confirmWeekChange('2026-09-30')).toBe(true)
      expect(ui.confirm).toHaveBeenCalledTimes(1)
    })

    it('離開頁面或網址換到別週：有未儲存變更要確認，取消就擋下', async () => {
      const wrapper = await mountWithPendingEdit()
      ui.confirm.mockRejectedValue('cancel')
      expect(await routeGuards.leave!()).toBe(false)
      expect(await routeGuards.update!({ query: { date: '2026-09-25' } })).toBe(false)
      expect(await routeGuards.update!({ query: { date: '2026-09-15', tab: 'records' } })).toBe(true) // 同週（切頁籤）不問
      expect(saveText(wrapper)).toBe('儲存排班（1 處變更）')
    })

    it('網址的 date 與頁面同一套解析：重複參數取第一個、格式不對＝沒換週不問（審查 F7）', async () => {
      await mountWithPendingEdit()
      ui.confirm.mockRejectedValue('cancel')
      expect(await routeGuards.update!({ query: { date: ['2026-09-25', 'x'] } })).toBe(false)
      ui.confirm.mockClear()
      expect(await routeGuards.update!({ query: { date: 'garbage' } })).toBe(true)
      expect(ui.confirm).not.toHaveBeenCalled()
    })

    it('路由守衛的確認框不因 hashchange 關閉；頁內換週的確認框維持預設（返回鍵時跟著關）（審查 F6）', async () => {
      const wrapper = await mountWithPendingEdit()
      ui.confirm.mockRejectedValue('cancel')
      await routeGuards.update!({ query: { date: '2026-09-25' } })
      expect(ui.confirm).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ closeOnHashChange: false }))
      await (wrapper.vm as unknown as PanelApi).confirmWeekChange('2026-09-25')
      expect(ui.confirm).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ closeOnHashChange: true }))
    })

    it('儲存進行中不能換週：直接擋下並提示，不問「要不要捨棄」（審查 F8）', async () => {
      const wrapper = await mountWithPendingEdit()
      api.saveDaily.mockReturnValue(new Promise(() => {}))
      await wrapper.find('[data-test="toolbar-save"]').trigger('click')
      await flushPromises()
      expect(await (wrapper.vm as unknown as PanelApi).confirmWeekChange('2026-09-23')).toBe(false)
      expect(ui.confirm).not.toHaveBeenCalled()
      expect(ui.warning).toHaveBeenCalledWith(expect.stringContaining('儲存中'))
    })

    it('改過的人在列首標「未儲存」，其他人不標', async () => {
      const wrapper = await mountWithPendingEdit()
      expect(wrapper.find('[data-test="unsaved-2"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="unsaved-1"]').exists()).toBe(false)
    })
  })
})

describe('ScheduleGridPanel 月模式（SPEC-027 C 期）', () => {
  const OCT = ['2026-10-01', '2026-10-02', '2026-10-05'].map((d) => day(d))
  function monthState() {
    const month = effectScope().run(() => useMonthGrid(ref('2026-10-05'), ref(0)))!
    return month
  }
  beforeEach(() => {
    api.grid.mockImplementation(async ({ start_date }: { start_date: string }) =>
      start_date === monthRange('2026-10-05').start
        ? { data: grid({ start_date, days: OCT, cells: [cell(1, '2026-10-01', { actual: { status: 'anomaly' } }), cell(2, '2026-10-02', { actual: {} })] }) }
        : { data: grid() },
    )
    api.getAssignments.mockResolvedValue({ data: [] })
  })

  it('本月型態的人在週格子與月格子的人員欄都有註記', async () => {
    // 員工 1 在 10/1、10/2、10/5 都是資料待補（匯入檔裡沒有他）
    api.grid.mockImplementation(async ({ start_date }: { start_date: string }) =>
      start_date === monthRange('2026-10-05').start
        ? { data: grid({ start_date, days: OCT, today: '2026-10-08', cells: OCT.filter((d) => d.is_workday).slice(0, 3).map((d) => cell(1, d.date, { actual: { status: 'data_incomplete' } })) }) }
        : { data: grid() },
    )
    const week = mountPanel({ date: '2026-10-05', view: 'week', month: monthState() })
    await flushPromises()
    expect(week.findComponent({ name: 'ShiftGrid' }).props('personNotes')).toEqual({ 1: { tag: '本月沒有打卡', detail: '本月 3 個應上班日都沒有打卡（匯入的打卡檔裡沒有這位員工）' } })
    const month = mountPanel({ date: '2026-10-05', view: 'month', month: monthState() })
    await flushPromises()
    expect(month.findComponent({ name: 'MonthGrid' }).props('personNotes')).toHaveProperty('1')
  })

  it('型態的格子傳給格子（降為待修設定）、工具列（拆數字）與抽屜（提醒）；抽屜的設定檢查與重算往上送', async () => {
    api.grid.mockImplementation(async ({ start_date }: { start_date: string }) =>
      start_date === monthRange('2026-10-05').start
        ? { data: grid({ start_date, days: OCT, today: '2026-10-08', cells: OCT.filter((d) => d.is_workday).slice(0, 3).map((d) => cell(1, d.date, { actual: { status: 'data_incomplete' } })) }) }
        : { data: grid() },
    )
    const wrapper = mountPanel({ date: '2026-10-05', view: 'month', month: monthState() })
    await flushPromises()
    const keys = wrapper.findComponent({ name: 'MonthGrid' }).props('patternKeys') as Set<string>
    expect([...keys].sort()).toEqual(['1|2026-10-01', '1|2026-10-02', '1|2026-10-05'])
    expect(wrapper.findComponent({ name: 'GridToolbar' }).props('patternIssueCount')).toBe(3)
    wrapper.findComponent({ name: 'MonthGrid' }).vm.$emit('select', 1, '2026-10-01')
    await flushPromises()
    const drawer = wrapper.findComponent(DrawerStub)
    expect(drawer.props('pattern')).toMatchObject({ employeeId: 1, kind: 'no_punches' })
    expect(drawer.props('patternMatchesDay')).toBe(true)
    drawer.vm.$emit('patterns')
    await flushPromises()
    expect(wrapper.emitted('show-patterns')).toHaveLength(1)
    expect(drawer.props('modelValue')).toBe(false)
    wrapper.findComponent({ name: 'MonthGrid' }).vm.$emit('show-patterns')
    expect(wrapper.emitted('show-patterns')).toHaveLength(2)
  })

  it('月模式畫月格子不畫週格子；點格用整月資料開抽屜並補抓該週週排班', async () => {
    api.getAssignments.mockImplementation(async ({ week_start }: { week_start: string }) => ({
      data: week_start === '2026-09-28' ? [assignment(1, 2)] : [],
    }))
    const wrapper = mountPanel({ date: '2026-10-05', view: 'month', month: monthState() })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MonthGrid' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ShiftGrid' }).exists()).toBe(false)
    await wrapper.find('[data-test="mcell-1-2026-10-01"]').trigger('click')
    await flushPromises()
    const drawer = wrapper.findComponent(DrawerStub)
    expect(drawer.props('modelValue')).toBe(true)
    expect(drawer.props('cell')).toMatchObject({ employee_id: 1, date: '2026-10-01' })
    expect(drawer.props('day')).toMatchObject({ date: '2026-10-01' })
    expect(api.getAssignments).toHaveBeenLastCalledWith({ week_start: '2026-09-28' })
    expect(drawer.props('weeklyShiftId')).toBe(2)
  })

  it('沒有排班權限：點格不補抓週排班；抽屜姓名表含整月才有的人員', async () => {
    const reader = { can_view_attendance: true, can_edit_plan: false, can_confirm: false, can_edit_attendance: true }
    const employees = [employee(1, '林班導'), employee(2, '王副導'), employee(3, '月中到職')]
    api.grid.mockImplementation(async ({ start_date }: { start_date: string }) => ({
      data: start_date === '2026-10-01'
        ? grid({ start_date, days: OCT, employees, caller: reader, cells: [cell(1, '2026-10-01', { actual: {} })] })
        : grid({ caller: reader }),
    }))
    const wrapper = mountPanel({ date: '2026-10-05', view: 'month', month: monthState() })
    await flushPromises()
    await wrapper.find('[data-test="mcell-1-2026-10-01"]').trigger('click')
    await flushPromises()
    expect(api.getAssignments).not.toHaveBeenCalled()
    const drawer = wrapper.findComponent(DrawerStub)
    expect(drawer.props('weeklyShiftId')).toBeNull()
    expect(drawer.props('employeeNames')).toMatchObject({ 3: '月中到職' })
  })

  it('抽屜處理完：通知頁面 changed（頁面遞增 revision，整月資料重抓；Review Focus #2）', async () => {
    const wrapper = mountPanel({ date: '2026-10-05', view: 'month', month: monthState() })
    await flushPromises()
    await wrapper.find('[data-test="mcell-1-2026-10-01"]').trigger('click')
    wrapper.findComponent(DrawerStub).vm.$emit('changed')
    await flushPromises()
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('週次欄頭：切回週模式；跨月週的錨點用該週在本月的第一天（10/1），週模式仍顯示 9/28 那週', async () => {
    const wrapper = mountPanel({ date: '2026-10-05', view: 'month', month: monthState() })
    await flushPromises()
    await wrapper.find('[data-test="month-week-2026-09-28"]').trigger('click')
    // 錨點若是週一 9/28，頁首年月、本月進度、出勤明細與匯出都會跳到 9 月
    expect(wrapper.emitted('update:view')).toEqual([['week', '2026-10-01']])
  })

  it('週次欄頭：沒跨月的週（10/5 那週）仍帶該週週一', async () => {
    const wrapper = mountPanel({ date: '2026-10-05', view: 'month', month: monthState() })
    await flushPromises()
    await wrapper.find('[data-test="month-week-2026-10-05"]').trigger('click')
    expect(wrapper.emitted('update:view')).toEqual([['week', '2026-10-05']])
  })

  describe('深連結在月模式開抽屜（M-2）', () => {
    const SEP28_WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']
    /** 錨點 10/1 的週資料（9/28 那週，含 focus 的格子）與整月資料；month 可延後回來，模擬週資料先到 */
    function mockGrids(monthGate?: Promise<void>) {
      api.grid.mockImplementation(async ({ start_date }: { start_date: string }) => {
        if (start_date === monthRange('2026-10-01').start) {
          await monthGate
          return { data: grid({ start_date, days: OCT, cells: [cell(1, '2026-10-01', { actual: {} })] }) }
        }
        return { data: grid({ days: SEP28_WEEK.map((d) => day(d)), cells: [cell(1, '2026-10-01', { actual: {} })] }) }
      })
      api.getAssignments.mockImplementation(async ({ week_start }: { week_start: string }) => ({
        data: week_start === '2026-09-28' ? [assignment(1, 2)] : [],
      }))
    }
    const mountFocused = () => mountPanel({
      date: '2026-10-01', view: 'month', focusEmployeeId: 1, focusDate: '2026-10-01',
      month: effectScope().run(() => useMonthGrid(ref('2026-10-01'), ref(0)))!,
    })

    it('補抓該格那週的週排班，抽屜帶該員工的週排班班別', async () => {
      mockGrids()
      const wrapper = mountFocused()
      await flushPromises()
      const drawer = wrapper.findComponent(DrawerStub)
      expect(drawer.props('modelValue')).toBe(true)
      expect(drawer.props('cell')).toMatchObject({ employee_id: 1, date: '2026-10-01' })
      expect(api.getAssignments).toHaveBeenCalledWith({ week_start: '2026-09-28' })
      expect(drawer.props('weeklyShiftId')).toBe(2)
    })

    it('週資料先於整月資料回來時也要補抓（不能只靠整月資料才知道有沒有排班權限）', async () => {
      let releaseMonth: () => void = () => {}
      mockGrids(new Promise<void>((resolve) => { releaseMonth = resolve }))
      const wrapper = mountFocused()
      await flushPromises()
      releaseMonth()
      await flushPromises()
      expect(api.getAssignments).toHaveBeenCalledWith({ week_start: '2026-09-28' })
      expect(wrapper.findComponent(DrawerStub).props('weeklyShiftId')).toBe(2)
    })
  })

  it('整月載入失敗：給重新載入，不顯示空白格子', async () => {
    api.grid.mockRejectedValue({ displayMessage: '伺服器錯誤' })
    const month = monthState()
    const wrapper = mountPanel({ date: '2026-10-05', view: 'month', month })
    await flushPromises()
    expect(wrapper.find('[data-test="month-load-error"]').exists()).toBe(true)
    api.grid.mockResolvedValue({ data: grid({ start_date: '2026-10-01', days: OCT }) })
    await wrapper.find('[data-test="month-load-error"] button').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MonthGrid' }).exists()).toBe(true)
  })
})

describe('ScheduleGridPanel 抽屜的待處理佇列', () => {
  // 今天 9/21：林班導 9/14 遲到、9/16 缺卡；王副導 9/15 疑似缺勤
  function issueGrid(resolved: string[] = []) {
    const status = (key: string, s: 'anomaly' | 'missing_punch' | 'suspected_absence') => (resolved.includes(key) ? 'matched' : s)
    return grid({
      cells: [
        ...WEEK.map((d) => cell(1, d, d === WEEK[0]
          ? { actual: { status: status('1|0', 'anomaly'), late_minutes: 20 } }
          : d === WEEK[2]
            ? { actual: { status: status('1|2', 'missing_punch') } }
            : { plan: { expected: day(d).is_workday } })),
        ...WEEK.map((d) => cell(2, d, d === WEEK[1] ? { actual: { status: status('2|1', 'suspected_absence') } } : { plan: { expected: day(d).is_workday } })),
      ],
    })
  }
  const drawer = (w: ReturnType<typeof mountPanel>) => w.findComponent(DrawerStub)
  const at = (w: ReturnType<typeof mountPanel>) => {
    const c = drawer(w).props('cell') as { employee_id: number; date: string } | null
    return c ? `${c.employee_id}|${c.date}` : null
  }

  beforeEach(() => {
    api.grid.mockImplementation(async () => ({ data: issueGrid() }))
  })

  it('依畫面上的列由上而下、每人由左而右排；上一筆／下一筆在待處理之間跳', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, WEEK[0])
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toEqual({ position: 1, total: 3, label: '本週逐日待辦 1 / 3', hasPrev: false, hasNext: true, back: null })
    drawer(wrapper).vm.$emit('navigate', 1)
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[2]}`)
    drawer(wrapper).vm.$emit('navigate', 1)
    await flushPromises()
    expect(at(wrapper)).toBe(`2|${WEEK[1]}`)
    expect(drawer(wrapper).props('nav')).toEqual({ position: 3, total: 3, label: '本週逐日待辦 3 / 3', hasPrev: true, hasNext: false, back: null })
    drawer(wrapper).vm.$emit('navigate', -1)
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[2]}`)
  })

  it('從不用處理的格子開：寫共幾筆，下一筆跳到它後面第一筆待處理', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, WEEK[1])
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toEqual({ position: null, total: 3, label: '共 3 件逐日待辦', hasPrev: true, hasNext: true, back: null })
    drawer(wrapper).vm.$emit('navigate', 1)
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[2]}`)
  })

  it('openFirstIssue（頁首「處理待辦」）：打開佇列順序的第一件並回 true，抽屜的上一筆／下一筆接著走', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.vm.openFirstIssue()).toBe(true)
    await flushPromises()
    expect(drawer(wrapper).props('modelValue')).toBe(true)
    expect(at(wrapper)).toBe(`1|${WEEK[0]}`)
    expect(drawer(wrapper).props('nav')).toEqual({ position: 1, total: 3, label: '本週逐日待辦 1 / 3', hasPrev: false, hasNext: true, back: null })
  })

  it('openFirstIssue：看得到的列裡沒有待處理就回 false，不開抽屜', async () => {
    api.grid.mockImplementation(async () => ({ data: issueGrid(['1|0', '1|2', '2|1']) }))
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.vm.openFirstIssue()).toBe(false)
    await flushPromises()
    expect(drawer(wrapper).props('modelValue')).toBe(false)
  })

  it('openFirstIssue：搜尋後只找看得到的列（跟抽屜的佇列同一個順序）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'GridToolbar' }).vm.$emit('update:keyword', '王')
    await flushPromises()
    expect(wrapper.vm.openFirstIssue()).toBe(true)
    await flushPromises()
    expect(at(wrapper)).toBe(`2|${WEEK[1]}`)
  })

  it('人員搜尋與篩選後只在看得到的列之間跳', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'GridToolbar' }).vm.$emit('update:keyword', '王')
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 2, WEEK[1])
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toEqual({ position: 1, total: 1, label: '本週逐日待辦 1 / 1', hasPrev: false, hasNext: false, back: null })
  })

  it('處理完這格（重抓後不再是待處理）自動跳下一筆並提示', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, WEEK[0])
    await flushPromises()
    api.grid.mockImplementation(async () => ({ data: issueGrid(['1|0']) }))
    drawer(wrapper).vm.$emit('changed')
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[2]}`)
    expect(ui.success).toHaveBeenCalledWith(expect.stringContaining('下一筆待處理：林班導 9/16'))
    expect(drawer(wrapper).props('modelValue')).toBe(true)
    // 剛跳過來短暫鎖住動作（連點不會落到這一筆），之後解鎖
    expect(drawer(wrapper).props('actionsLocked')).toBe(true)
    await new Promise((r) => setTimeout(r, 750))
    expect(drawer(wrapper).props('actionsLocked')).toBe(false)
    // 可以回剛才那格；回去後不再顯示
    expect(drawer(wrapper).props('nav')).toMatchObject({ back: '林班導 9/14' })
    drawer(wrapper).vm.$emit('back')
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[0]}`)
    expect(drawer(wrapper).props('nav').back ?? null).toBeNull()
  })

  it('接受／豁免已跳過可復原的提示：自動跳下一件時不再另外提示「已處理。下一筆…」', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, WEEK[0])
    await flushPromises()
    api.grid.mockImplementation(async () => ({ data: issueGrid(['1|0']) }))
    drawer(wrapper).vm.$emit('changed', { undoToast: true })
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[2]}`)
    expect(ui.success).not.toHaveBeenCalled()
    expect(drawer(wrapper).props('nav')).toMatchObject({ back: '林班導 9/14' })
  })

  it('按了復原：重抓這週並通知頁面（另一個面板與整月資料跟著同步），不自動跳格', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, WEEK[2])
    await flushPromises()
    const calls = api.grid.mock.calls.length
    drawer(wrapper).vm.$emit('undone')
    await flushPromises()
    expect(api.grid.mock.calls.length).toBe(calls + 1)
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(at(wrapper)).toBe(`1|${WEEK[2]}`)
    expect(drawer(wrapper).props('actionsLocked')).toBe(false)
  })

  it('送出後等重抓期間鎖住動作（避免同一格重複送出）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, WEEK[0])
    await flushPromises()
    let resolveGrid: (v: unknown) => void = () => {}
    api.grid.mockImplementation(() => new Promise((r) => { resolveGrid = r }))
    drawer(wrapper).vm.$emit('changed')
    await flushPromises()
    expect(drawer(wrapper).props('actionsLocked')).toBe(true)
    resolveGrid({ data: issueGrid() })
    await flushPromises()
    // 仍是待處理：留在原格並解鎖
    expect(at(wrapper)).toBe(`1|${WEEK[0]}`)
    expect(drawer(wrapper).props('actionsLocked')).toBe(false)
  })

  it('手動換格後「回剛才」就不再顯示', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, WEEK[0])
    await flushPromises()
    api.grid.mockImplementation(async () => ({ data: issueGrid(['1|0']) }))
    drawer(wrapper).vm.$emit('changed')
    await flushPromises()
    drawer(wrapper).vm.$emit('navigate', 1)
    await flushPromises()
    expect(drawer(wrapper).props('nav').back ?? null).toBeNull()
  })

  it('重抓後仍是待處理（例如只處理了一半）就留在原格', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, WEEK[0])
    await flushPromises()
    drawer(wrapper).vm.$emit('changed')
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[0]}`)
  })

  it('最後一筆處理完：往前找還沒處理的；全部處理完就留在原格並說清完了', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 2, WEEK[1])
    await flushPromises()
    api.grid.mockImplementation(async () => ({ data: issueGrid(['2|1']) }))
    drawer(wrapper).vm.$emit('changed')
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[0]}`)

    api.grid.mockImplementation(async () => ({ data: issueGrid(['1|0', '1|2', '2|1']) }))
    drawer(wrapper).vm.$emit('changed')
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[0]}`)
    expect(ui.success).toHaveBeenLastCalledWith('這週的逐日待辦都處理完了')
  })

  it('月模式：等頁面重抓整月資料（revision）後才判斷，處理完一樣跳下一筆', async () => {
    const revision = ref(0)
    const month = effectScope().run(() => useMonthGrid(ref('2026-09-16'), revision))!
    const wrapper = mountPanel({ view: 'month', month })
    await flushPromises()
    wrapper.findComponent({ name: 'MonthGrid' }).vm.$emit('select', 1, WEEK[0])
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toMatchObject({ position: 1, total: 3 })
    api.grid.mockImplementation(async () => ({ data: issueGrid(['1|0']) }))
    drawer(wrapper).vm.$emit('changed')
    await flushPromises()
    // 週資料重抓了但整月資料還沒：抽屜仍在原格
    expect(at(wrapper)).toBe(`1|${WEEK[0]}`)
    expect(wrapper.emitted('changed')).toHaveLength(1)
    revision.value += 1
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[2]}`)
  })

  it('月模式整月資料重抓失敗：抽屜收起，重新載入後不會自己彈回來跳格', async () => {
    const revision = ref(0)
    const month = effectScope().run(() => useMonthGrid(ref('2026-09-16'), revision))!
    const wrapper = mountPanel({ view: 'month', month })
    await flushPromises()
    wrapper.findComponent({ name: 'MonthGrid' }).vm.$emit('select', 1, WEEK[0])
    await flushPromises()
    drawer(wrapper).vm.$emit('changed')
    await flushPromises()
    api.grid.mockRejectedValueOnce(new Error('boom'))
    revision.value += 1
    await flushPromises()
    api.grid.mockImplementation(async () => ({ data: issueGrid(['1|0']) }))
    await month.reload()
    await flushPromises()
    expect(drawer(wrapper).props('modelValue')).toBe(false)
  })

  it('從不是待處理的格子操作（例如改未來的班）不會自動跳走', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, WEEK[4])
    await flushPromises()
    drawer(wrapper).vm.$emit('changed')
    await flushPromises()
    expect(at(wrapper)).toBe(`1|${WEEK[4]}`)
  })
})

describe('ScheduleGridPanel 抽屜佇列跨整月（核對週檢視也一樣）', () => {
  // 今天 9/30。林班導 9/14、9/22 遲到；王副導 9/15 缺卡；陳老師整月沒打卡（型態＝設定問題，另外處理）
  const NEXT = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']
  const TODAY = '2026-09-30'
  const people = [employee(1, '林班導'), employee(2, '王副導'), employee(3, '陳老師')]
  function monthCells(resolved: string[] = []) {
    const status = (key: string, s: 'anomaly' | 'missing_punch') => (resolved.includes(key) ? 'matched' : s)
    return [...WEEK, ...NEXT].flatMap((d) => {
      const workday = day(d).is_workday
      return [
        cell(1, d, d === '2026-09-14' || d === '2026-09-22' ? { actual: { status: status(`1|${d}`, 'anomaly'), late_minutes: 5 } } : { plan: { expected: workday } }),
        cell(2, d, d === '2026-09-15' ? { actual: { status: status(`2|${d}`, 'missing_punch') } } : { plan: { expected: workday } }),
        cell(3, d, workday ? { actual: { status: 'data_incomplete' } } : { plan: { expected: false } }),
      ]
    })
  }
  type GridMockOptions = {
    /** 週資料看到的已處理清單（不給＝同整月）：模擬換週途中領到送出前就在途的舊快照 */
    weekResolved?: () => string[]
    /** 頁面重抓整月（第一次之後）先不回來，呼叫 release() 才回（同月重抓時整月資料保留舊值） */
    holdMonthReload?: { release: () => void }
  }
  function mockGrids(resolved: () => string[] = () => [], opts: GridMockOptions = {}) {
    let monthCalls = 0
    api.grid.mockImplementation(async ({ start_date }: { start_date: string }) => {
      if (start_date === '2026-09-01') {
        const hold = opts.holdMonthReload
        if (monthCalls++ > 0 && hold) await new Promise<void>((r) => { hold.release = r })
        return { data: grid({ start_date, days: [...WEEK, ...NEXT].map((d) => day(d)), today: TODAY, employees: people, cells: monthCells(resolved()) }) }
      }
      const week = start_date === NEXT[0] ? NEXT : WEEK
      const cells = monthCells((opts.weekResolved ?? resolved)())
      return { data: grid({ start_date: week[0], days: week.map((d) => day(d)), today: TODAY, employees: people, cells: cells.filter((c) => week.includes(c.date)) }) }
    })
  }
  const drawer = (w: ReturnType<typeof mountPanel>) => w.findComponent(DrawerStub)
  const at = (w: ReturnType<typeof mountPanel>) => {
    const c = drawer(w).props('cell') as { employee_id: number; date: string } | null
    return c ? `${c.employee_id}|${c.date}` : null
  }
  const mountWeek = (date = '2026-09-16', revision = ref(0)) =>
    mountPanel({ date, view: 'week', month: effectScope().run(() => useMonthGrid(ref(date), revision))! })

  it('週檢視的佇列含別週的逐日待辦；標籤寫月份與第幾件；跳到別週的格子時讓格子跟過去', async () => {
    mockGrids()
    const wrapper = mountWeek()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, '2026-09-14')
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toEqual({ position: 1, total: 3, label: '9 月逐日待辦 1 / 3', hasPrev: false, hasNext: true, back: null })
    drawer(wrapper).vm.$emit('navigate', 1)
    await flushPromises()
    // 同一人的下一件在下週：抽屜先用整月那一格，並請頁面把錨點移過去
    expect(at(wrapper)).toBe('1|2026-09-22')
    expect(drawer(wrapper).props('modelValue')).toBe(true)
    expect(wrapper.emitted('update:date')).toEqual([['2026-09-22']])
    // 週排班層是這週的，不能拿來當下週那格的
    expect(drawer(wrapper).props('weeklyShiftId')).toBeNull()
    expect(drawer(wrapper).props('nav')).toMatchObject({ position: 2, label: '9 月逐日待辦 2 / 3' })
    // 頁面換了錨點：週資料到了就換回週資料，抽屜不關
    await wrapper.setProps({ date: '2026-09-22' })
    await flushPromises()
    expect(at(wrapper)).toBe('1|2026-09-22')
    expect(drawer(wrapper).props('modelValue')).toBe(true)
    drawer(wrapper).vm.$emit('navigate', 1)
    await flushPromises()
    expect(at(wrapper)).toBe('2|2026-09-15')
    expect(wrapper.emitted('update:date')).toEqual([['2026-09-22'], ['2026-09-15']])
  })

  it('型態格（設定問題）不在佇列：從那格開寫共幾件逐日待辦', async () => {
    mockGrids()
    const wrapper = mountWeek()
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 3, '2026-09-14')
    await flushPromises()
    expect(drawer(wrapper).props('patternMatchesDay')).toBe(true)
    // 陳老師排在最後一列：佇列裡的三件都在她前面
    expect(drawer(wrapper).props('nav')).toEqual({ position: null, total: 3, label: '共 3 件逐日待辦', hasPrev: true, hasNext: false, back: null })
  })

  it('openFirstIssue：回整月佇列的第一件（就算在別週）並讓格子跟過去', async () => {
    mockGrids()
    const wrapper = mountWeek('2026-09-23')
    await flushPromises()
    expect(wrapper.vm.openFirstIssue()).toBe(true)
    await flushPromises()
    expect(at(wrapper)).toBe('1|2026-09-14')
    expect(wrapper.emitted('update:date')).toEqual([['2026-09-14']])
  })

  it('openFirstIssue：整月佇列空了（只剩型態格）回 false', async () => {
    mockGrids(() => ['1|2026-09-14', '1|2026-09-22', '2|2026-09-15'])
    const wrapper = mountWeek()
    await flushPromises()
    expect(wrapper.vm.openFirstIssue()).toBe(false)
  })

  it('處理完自動跳到佇列中下一件仍待處理的格子；在別週就讓格子跟過去', async () => {
    const resolved: string[] = []
    mockGrids(() => resolved)
    const revision = ref(0)
    const wrapper = mountWeek('2026-09-16', revision)
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, '2026-09-14')
    await flushPromises()
    resolved.push('1|2026-09-14')
    drawer(wrapper).vm.$emit('changed', { undoToast: true })
    await flushPromises()
    expect(at(wrapper)).toBe('1|2026-09-22')
    expect(wrapper.emitted('update:date')).toEqual([['2026-09-22']])
    expect(ui.success).not.toHaveBeenCalled()
    // 頁面遞增 revision 重抓整月：剛處理的那件不再算
    revision.value += 1
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toMatchObject({ position: 1, total: 2, label: '9 月逐日待辦 1 / 2' })
  })

  it('整月資料還沒重抓回來：剛處理的那件立即從佇列扣掉；最後一件處理完說「都處理完了」，不跳回已處理的格子', async () => {
    // 9/22 那件先當已處理：剩下的 1|9/14、2|9/15 都在這週
    const resolved = ['1|2026-09-22']
    const hold = { release: () => {} }
    mockGrids(() => resolved, { holdMonthReload: hold })
    const revision = ref(0)
    const wrapper = mountWeek('2026-09-16', revision)
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, '2026-09-14')
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toMatchObject({ position: 1, total: 2 })

    resolved.push('1|2026-09-14')
    drawer(wrapper).vm.$emit('changed', { undoToast: true })
    revision.value += 1 // 頁面收到 changed 重抓整月，一直沒回來
    await flushPromises()
    expect(at(wrapper)).toBe('2|2026-09-15')
    // 標籤總數立即扣掉剛處理的那件；「上一件」不會回到它
    expect(drawer(wrapper).props('nav')).toMatchObject({ position: 1, total: 1, label: '9 月逐日待辦 1 / 1', hasPrev: false, hasNext: false })

    await new Promise((r) => setTimeout(r, 650)) // 跳格後的短暫鎖定
    resolved.push('2|2026-09-15')
    drawer(wrapper).vm.$emit('changed', { undoToast: true })
    revision.value += 1
    await flushPromises()
    expect(at(wrapper)).toBe('2|2026-09-15')
    expect(ui.success).toHaveBeenLastCalledWith('這個月的逐日待辦都處理完了')
    expect(drawer(wrapper).props('actionsLocked')).toBe(false)

    // 整月資料終於回來（已含這兩次處理）：佇列和新資料一致
    hold.release()
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toMatchObject({ position: null, total: 0 })
  })

  it('送出時用的是整月那一格（週資料還沒到）：換週領到的舊快照不算數，等整月新資料到了才判斷、照樣自動前進', async () => {
    const resolved: string[] = []
    const weekSnapshot: string[] = []
    mockGrids(() => resolved, { weekResolved: () => weekSnapshot })
    const revision = ref(0)
    const wrapper = mountWeek('2026-09-16', revision)
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, '2026-09-14')
    await flushPromises()
    drawer(wrapper).vm.$emit('navigate', 1)
    await flushPromises()
    expect(at(wrapper)).toBe('1|2026-09-22') // 下週那件，抽屜先用整月那一格

    resolved.push('1|2026-09-22')
    drawer(wrapper).vm.$emit('changed', { undoToast: true })
    await flushPromises()
    // 頁面把錨點移到下週：週資料是送出前的舊快照（那件仍是待辦）
    await wrapper.setProps({ date: '2026-09-22' })
    await flushPromises()
    expect(at(wrapper)).toBe('1|2026-09-22')
    expect(drawer(wrapper).props('actionsLocked')).toBe(true)

    // 整月新資料到了：那件已處理，跳到下一件（在上週，格子跟過去）
    revision.value += 1
    await flushPromises()
    expect(at(wrapper)).toBe('2|2026-09-15')
    expect(wrapper.emitted('update:date')).toEqual([['2026-09-22'], ['2026-09-15']])
  })

  it('按了復原：先前排除的「剛處理」格子回到佇列', async () => {
    const resolved = ['1|2026-09-22']
    mockGrids(() => resolved, { holdMonthReload: { release: () => {} } })
    const revision = ref(0)
    const wrapper = mountWeek('2026-09-16', revision)
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, '2026-09-14')
    await flushPromises()
    resolved.push('1|2026-09-14')
    drawer(wrapper).vm.$emit('changed', { undoToast: true })
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toMatchObject({ total: 1 })
    resolved.pop()
    drawer(wrapper).vm.$emit('undone')
    await flushPromises()
    expect(drawer(wrapper).props('nav')).toMatchObject({ total: 2 })
  })

  it('沒有整月資料：退回這週的佇列（也就認不出型態格，這週的待辦全算）', async () => {
    mockGrids()
    const wrapper = mountPanel({ date: '2026-09-16', view: 'week' })
    await flushPromises()
    wrapper.findComponent({ name: 'ShiftGrid' }).vm.$emit('select', 1, '2026-09-14')
    await flushPromises()
    // 林班導 9/14、王副導 9/15、陳老師 9/14–9/18 五天
    expect(drawer(wrapper).props('nav')).toMatchObject({ position: 1, total: 7, label: '本週逐日待辦 1 / 7' })
  })
})

describe('ScheduleGridPanel 在格子上捲動先收起頁首', () => {
  function mountInMain(toolbarTop: number) {
    const main = document.createElement('div')
    main.className = 'el-main'
    document.body.appendChild(main)
    let top = 0
    Object.defineProperty(main, 'clientHeight', { value: 836, configurable: true })
    Object.defineProperty(main, 'scrollHeight', { value: 1300, configurable: true })
    Object.defineProperty(main, 'scrollTop', { get: () => top, set: (v: number) => { top = v }, configurable: true })
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const y = this === main ? 64 : this.classList.contains('grid-toolbar') ? toolbarTop : 0
      return { top: y, bottom: y, left: 0, right: 0, width: 0, height: 0, x: 0, y, toJSON: () => ({}) } as DOMRect
    })
    const wrapper = mount(ScheduleGridPanel, {
      props: { mode: 'reconcile', date: '2026-09-16', filter: 'all' },
      attachTo: main,
      global: { plugins: [ElementPlus], stubs: { PersonDayDrawer: DrawerStub, BatchConfirmDialog: BatchStub, teleport: true } },
    })
    return { wrapper, main, rect, cleanup: () => { wrapper.unmount(); rect.mockRestore(); main.remove() } }
  }
  const wheel = (el: Element, deltaY: number) => {
    const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
    el.dispatchEvent(event)
    return event
  }

  it('工具列還沒貼頂：往下捲先捲外層並擋下格子的捲動', async () => {
    const { wrapper, main, cleanup } = mountInMain(365)
    await flushPromises()
    const scroller = wrapper.get('.shift-grid__scroller').element
    const event = wheel(scroller, 120)
    expect(event.defaultPrevented).toBe(true)
    expect(main.scrollTop).toBe(120)
    // 往上捲照瀏覽器預設（格子捲到頂後自然帶動外層）
    expect(wheel(scroller, -120).defaultPrevented).toBe(false)
    cleanup()
  })

  it('shift＋滾輪（橫向捲動）不攔', async () => {
    const { wrapper, main, cleanup } = mountInMain(365)
    await flushPromises()
    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
    // happy-dom 的 WheelEvent 不吃 shiftKey 初始值
    Object.defineProperty(event, 'shiftKey', { value: true })
    wrapper.get('.shift-grid__scroller').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    const horizontal = new WheelEvent('wheel', { deltaX: 200, deltaY: 30, bubbles: true, cancelable: true })
    wrapper.get('.shift-grid__scroller').element.dispatchEvent(horizontal)
    expect(horizontal.defaultPrevented).toBe(false)
    expect(main.scrollTop).toBe(0)
    cleanup()
  })

  it('工具列已貼頂：交給格子自己捲', async () => {
    const { wrapper, main, cleanup } = mountInMain(64)
    await flushPromises()
    const event = wheel(wrapper.get('.shift-grid__scroller').element, 120)
    expect(event.defaultPrevented).toBe(false)
    expect(main.scrollTop).toBe(0)
    cleanup()
  })
})
