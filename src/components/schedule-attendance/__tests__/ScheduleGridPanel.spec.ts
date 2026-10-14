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
  props: ['modelValue', 'cell', 'weeklyShiftId', 'day', 'employeeNames'],
  emits: ['records', 'changed', 'update:modelValue'],
  methods: { requestClose: () => drawerRequestClose() },
  template: '<div data-test="drawer-stub" />',
}
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
  device.mobile = false
  api.grid.mockResolvedValue({ data: recordedGrid() })
  api.getAssignments.mockResolvedValue({ data: [assignment(1, 1), assignment(2, 1)] })
  api.saveAssignments.mockResolvedValue({ data: { message: 'ok', week_start_date: W1, warnings: [] } })
  api.saveDaily.mockResolvedValue({ data: {} })
  ui.confirm.mockResolvedValue('confirm')
  drawerRequestClose.mockResolvedValue(true)
})

describe('ScheduleGridPanel', () => {
  it('月模式：工具列換月送出 update:date（頁面據此先問未儲存的週排班）；週／月切換送出 update:view', async () => {
    api.grid.mockResolvedValue({ data: grid() })
    api.getAssignments.mockResolvedValue({ data: [] })
    const month = effectScope().run(() => useMonthGrid(ref('2026-09-16'), ref(0)))!
    const wrapper = mountPanel({ view: 'month', month })
    await flushPromises()
    const toolbar = wrapper.findComponent({ name: 'GridToolbar' })
    expect(toolbar.props('view')).toBe('month')
    toolbar.vm.$emit('update:date', '2026-10-01')
    toolbar.vm.$emit('update:view', 'week')
    expect(wrapper.emitted('update:date')).toEqual([['2026-10-01']])
    expect(wrapper.emitted('update:view')).toEqual([['week']])
  })

  it('只有桌機且頁面給了整月資料才能切月；手機與沒給 month 都不出現週／月切換', async () => {
    api.grid.mockResolvedValue({ data: grid() })
    api.getAssignments.mockResolvedValue({ data: [] })
    const month = effectScope().run(() => useMonthGrid(ref('2026-09-16'), ref(0)))!
    const canMonth = async (props: Record<string, unknown>) => {
      const wrapper = mountPanel(props)
      await flushPromises()
      return wrapper.findComponent({ name: 'GridToolbar' }).props('canMonth')
    }
    expect(await canMonth({ month })).toBe(true)
    expect(await canMonth({})).toBe(false)
    device.mobile = true
    expect(await canMonth({ month })).toBe(false)
  })

  it('載入錨點所在週，顯示格子與問題數', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(api.grid).toHaveBeenCalledWith({ start_date: W1, end_date: WEEK[6] })
    expect(wrapper.find('[data-test="shift-grid-table"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('只看待處理（1）')
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
    await flushPromises() // 先問抽屜有沒有未送出的原因
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

  describe('未儲存的週班別不會無聲消失', () => {
    type PanelApi = { confirmWeekChange: (date: string) => Promise<boolean> }
    const saveText = (w: ReturnType<typeof mountPanel>) => w.find('[data-test="toolbar-save"]').text()

    async function mountWithPendingEdit() {
      const wrapper = mountPanel()
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
      expect(saveText(wrapper)).toBe('儲存排班（0 處變更）')
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
