import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useScheduleGrid } from '../useScheduleGrid'
import { cell, day, grid, W1, WEEK } from '@/components/schedule-attendance/__tests__/gridFixtures'

const api = vi.hoisted(() => ({
  grid: vi.fn(),
  getAssignments: vi.fn(),
  saveAssignments: vi.fn(),
  saveDaily: vi.fn(),
}))
vi.mock('@/api/scheduleAttendance', () => ({ getScheduleAttendanceGrid: api.grid }))
vi.mock('@/api/shifts', () => ({
  getAssignments: api.getAssignments,
  saveAssignments: api.saveAssignments,
  saveDaily: api.saveDaily,
}))

const assignment = (employeeId: number, shiftTypeId: number | null, notes = '') => ({
  id: employeeId * 10,
  employee_id: employeeId,
  employee_name: `員工${employeeId}`,
  shift_type_id: shiftTypeId,
  shift_type_name: '',
  notes,
  week_start_date: W1,
  work_start: '07:00',
  work_end: '16:30',
})

/** 員工 2：週一已打卡且可確認、週二已打卡但為本人、其餘未打卡。 */
function recordedWeek() {
  const days = WEEK.map((d) => day(d))
  return grid({
    days,
    cells: [
      ...WEEK.map((d) => cell(1, d, { plan: { expected: day(d).is_workday } })),
      cell(2, WEEK[0], { actual: { version: 'c'.repeat(64) }, edit: { recorded: true, confirm: true, plan: false, locked_reason: 'recorded' } }),
      cell(2, WEEK[1], { actual: {}, edit: { recorded: true, confirm: false, plan: false, locked_reason: 'self' } }),
      ...WEEK.slice(2).map((d) => cell(2, d, { plan: { expected: day(d).is_workday } })),
    ],
  })
}

async function loaded(data = grid()) {
  api.grid.mockResolvedValue({ data })
  const weekStart = ref(W1)
  const state = useScheduleGrid(weekStart)
  await state.reload()
  return { state, weekStart }
}

beforeEach(() => {
  vi.resetAllMocks()
  api.getAssignments.mockResolvedValue({ data: [assignment(1, 1, '原備註'), assignment(2, 1)] })
  api.saveAssignments.mockResolvedValue({ data: { message: 'ok', week_start_date: W1, warnings: [] } })
  api.saveDaily.mockResolvedValue({ data: {} })
})

describe('useScheduleGrid', () => {
  it('載入一週格子；有排班權限才取週排班', async () => {
    const { state } = await loaded()
    expect(api.grid).toHaveBeenCalledWith({ start_date: W1, end_date: WEEK[6] })
    expect(api.getAssignments).toHaveBeenCalledWith({ week_start: W1 })
    expect(state.weeklyValue(1)).toBe(1)

    api.getAssignments.mockClear()
    const readOnly = grid({ caller: { can_view_attendance: true, can_edit_plan: false, can_confirm: false, can_edit_attendance: false } })
    await loaded(readOnly)
    expect(api.getAssignments).not.toHaveBeenCalled()
  })

  it('整週未打卡：只送有變更的員工，保留原備註，並帶回週工時預警', async () => {
    api.saveAssignments.mockResolvedValue({
      data: { message: 'ok', week_start_date: W1, warnings: [{ code: 'WEEKLY_HOURS', employee_id: 1, employee_name: '林班導', calculated_hours: 45, limit_hours: 40, message: '超過 40 小時', week_start: W1 }] },
    })
    const { state } = await loaded()
    state.setWeekly(1, 2)
    state.setWeekly(2, 1) // 與現值相同＝無變更
    expect(state.pendingCount.value).toBe(1)

    const outcome = await state.save()

    expect(api.saveAssignments).toHaveBeenCalledWith({
      week_start_date: W1,
      assignments: [{ employee_id: 1, shift_type_id: 2, notes: '原備註' }],
    })
    expect(outcome).toMatchObject({ weeklySaved: 1, dailySaved: 0, units: [], blocked: [] })
    expect(state.warnings.value).toHaveLength(1)
    expect(state.pendingCount.value).toBe(0)
    expect(api.grid).toHaveBeenCalledTimes(2) // 儲存後重新載入
  })

  it('部分已打卡：未打卡工作日改送每日調整、已打卡可確認者進批次確認、本人列為無法確認', async () => {
    const { state } = await loaded(recordedWeek())
    state.setWeekly(2, 2)

    const outcome = await state.save()

    expect(api.saveAssignments).not.toHaveBeenCalled()
    expect(api.saveDaily.mock.calls.map(([body]) => body.date)).toEqual(WEEK.slice(2, 5))
    expect(api.saveDaily).toHaveBeenCalledWith({ employee_id: 2, date: WEEK[2], shift_type_id: 2, day_off: false })
    expect(outcome.units).toEqual([
      { items: [{ employee_id: 2, date: WEEK[0], shift_type_id: 2, day_off: false, version: 'c'.repeat(64) }] },
    ])
    expect(outcome.blocked).toEqual([{ employeeId: 2, dates: [WEEK[1]] }])
    expect(state.pendingCount.value).toBe(0)
  })

  it('已打卡週要清除週排班：無法用每日調整表達，整位員工列為無法處理', async () => {
    const { state } = await loaded(recordedWeek())
    state.setWeekly(2, null)
    const outcome = await state.save()
    expect(api.saveDaily).not.toHaveBeenCalled()
    expect(outcome.units).toEqual([])
    expect(outcome.blocked[0].employeeId).toBe(2)
  })

  it('後端回「已打卡」409：重新載入後改走拆分，不拋出原始錯誤', async () => {
    const { state } = await loaded()
    api.saveAssignments.mockRejectedValueOnce({
      response: { status: 409 },
      displayMessage: '部分員工該週已有出勤紀錄，請至「班表與打卡核對」逐日確認班別',
    })
    api.grid.mockResolvedValue({ data: recordedWeek() })
    state.setWeekly(2, 2)

    const outcome = await state.save()

    expect(api.saveAssignments).toHaveBeenCalledTimes(1)
    expect(outcome.units).toHaveLength(1)
    expect(api.saveDaily).toHaveBeenCalledTimes(3)
  })

  it('換週時丟棄晚到的舊回應與未儲存變更', async () => {
    let resolveOld: (v: unknown) => void = () => {}
    api.grid.mockReturnValueOnce(new Promise((r) => { resolveOld = r }))
    const weekStart = ref(W1)
    const state = useScheduleGrid(weekStart)
    const first = state.reload()
    state.setWeekly(1, 2)
    api.grid.mockResolvedValueOnce({ data: grid({ start_date: '2026-09-21' }) })
    weekStart.value = '2026-09-21'
    await nextTick()
    await flushPromises()
    resolveOld({ data: grid({ start_date: 'stale' }) })
    await first
    expect(state.grid.value?.start_date).toBe('2026-09-21')
    expect(state.pendingCount.value).toBe(0)
  })

  it('複製指定週只帶入格子內的員工，且只改本地緩衝', async () => {
    const { state } = await loaded()
    api.getAssignments.mockResolvedValueOnce({ data: [assignment(1, 2), assignment(99, 2)] })
    const copied = await state.copyFromWeek('2026-09-07')
    expect(copied).toBe(1)
    expect(state.weeklyValue(1)).toBe(2)
    expect(api.saveAssignments).not.toHaveBeenCalled()
  })

  it('週排班儲存失敗（非 409）：回傳錯誤訊息、保留已拆分的批次確認、該批員工留在緩衝', async () => {
    const { state } = await loaded(recordedWeek())
    state.setWeekly(2, 2) // 部分已打卡：產生 units、每日調整成功
    state.setWeekly(1, 2) // 整週未打卡：走週排班
    api.saveAssignments.mockRejectedValueOnce({ response: { status: 500 }, displayMessage: '伺服器錯誤' })

    const outcome = await state.save()

    expect(outcome.units.length).toBeGreaterThan(0)
    expect(outcome.errors).toContain('伺服器錯誤')
    expect(state.weeklyEdits.value).toHaveProperty('1')
    expect(state.weeklyEdits.value).not.toHaveProperty('2')
  })

  it('儲存途中換週：停止送出寫入、不送 undefined 班別，並回報已取消', async () => {
    const { state, weekStart } = await loaded(recordedWeek())
    state.setWeekly(2, 2) // 每日調整：第一天 saveDaily 會被掛住
    state.setWeekly(1, 2) // 週排班：換週後不得送出
    let resolveDaily: (v: unknown) => void = () => {}
    api.saveDaily.mockImplementationOnce(() => new Promise((r) => { resolveDaily = r }))

    const pending = state.save()
    await flushPromises()
    weekStart.value = '2026-10-19'
    await flushPromises()
    resolveDaily({ data: {} })
    const outcome = await pending

    expect(api.saveAssignments).not.toHaveBeenCalled()
    expect(outcome.errors).toContain('儲存途中切換了週次，尚未送出的變更已取消')
  })

  it('複製途中換週：回傳 0，不寫入新週緩衝', async () => {
    const { state, weekStart } = await loaded()
    let resolveCopy: (v: unknown) => void = () => {}
    api.getAssignments.mockReturnValueOnce(new Promise((r) => { resolveCopy = r }))

    const pending = state.copyFromWeek('2026-09-07')
    weekStart.value = '2026-10-19'
    await flushPromises()
    resolveCopy({ data: [assignment(1, 2)] })
    const copied = await pending

    expect(copied).toBe(0)
    expect(state.pendingCount.value).toBe(0)
  })

  it('換週後 grid 載入失敗：不留上一週的格子（grid 為 null、有 loadError），也不留舊週的週排班', async () => {
    const { state, weekStart } = await loaded()
    expect(state.grid.value?.start_date).toBe(W1)
    expect(state.weeklyValue(1)).toBe(1)
    api.grid.mockRejectedValue(new Error('500'))
    weekStart.value = '2026-09-21'
    await flushPromises()
    expect(state.loadError.value).toBeTruthy()
    expect(state.grid.value).toBeNull()
    expect(state.assignments.value).toEqual({})
    expect(state.loading.value).toBe(false)
  })

  it('換週後 getAssignments 失敗：整次視為失敗，不留新週 grid 搭配舊週 assignments', async () => {
    const { state, weekStart } = await loaded()
    api.grid.mockResolvedValue({ data: grid({ start_date: '2026-09-21' }) })
    api.getAssignments.mockRejectedValue(new Error('500'))
    weekStart.value = '2026-09-21'
    await flushPromises()
    expect(state.loadError.value).toBeTruthy()
    expect(state.grid.value).toBeNull()
    expect(state.assignments.value).toEqual({})
  })

  it('第一次載入就 getAssignments 失敗：grid 維持 null', async () => {
    api.grid.mockResolvedValue({ data: grid() })
    api.getAssignments.mockRejectedValue(new Error('500'))
    const state = useScheduleGrid(ref(W1))
    await state.reload()
    expect(state.loadError.value).toBeTruthy()
    expect(state.grid.value).toBeNull()
  })

  it('同一週重新載入失敗：保留該週既有格子（只換週才清空）', async () => {
    const { state } = await loaded()
    api.grid.mockRejectedValue(new Error('500'))
    await state.reload()
    expect(state.loadError.value).toBeTruthy()
    expect(state.grid.value?.start_date).toBe(W1)
  })

  it('格子週次與目前週次不符（換週後載入尚未開始）：儲存回錯誤且不送出任何寫入', async () => {
    const { state, weekStart } = await loaded(recordedWeek())
    state.setWeekly(1, 2)
    state.setWeekly(2, 2)
    weekStart.value = '2026-09-21' // watch 尚未執行 reload，grid 仍是上一週
    const outcome = await state.save()
    expect(outcome.errors).toEqual(['本週資料尚未載入完成，請稍後再儲存'])
    expect(outcome.units).toEqual([])
    expect(api.saveAssignments).not.toHaveBeenCalled()
    expect(api.saveDaily).not.toHaveBeenCalled()
    await flushPromises()
  })

  it('拆分路徑的每日調整撞「已打卡」409：顯示友善訊息（不指向已退場頁名），該員工留在緩衝', async () => {
    const { state } = await loaded(recordedWeek())
    const raw = '該日已有出勤紀錄，請至「班表與打卡核對」確認當日班別；恢復繼承時請確認原週班別'
    api.saveDaily.mockImplementation(async ({ date }: { date: string }) => {
      if (date === WEEK[2]) throw Object.assign(new Error('409'), { response: { status: 409 }, displayMessage: raw })
      return { data: {} }
    })
    state.setWeekly(2, 2)
    const outcome = await state.save()
    expect(outcome.errors).toEqual([`${WEEK[2]}：這天已有打卡紀錄，請重新整理後再儲存`])
    expect(outcome.errors.join('')).not.toContain('班表與打卡核對')
    expect(state.weeklyEdits.value).toHaveProperty('2')
  })

  it('每日調整的非打卡類失敗仍顯示後端訊息', async () => {
    const { state } = await loaded(recordedWeek())
    api.saveDaily.mockImplementation(async ({ date }: { date: string }) => {
      if (date === WEEK[2]) throw Object.assign(new Error('500'), { response: { status: 500 }, displayMessage: '伺服器忙碌' })
      return { data: {} }
    })
    state.setWeekly(2, 2)
    const outcome = await state.save()
    expect(outcome.errors).toEqual([`${WEEK[2]}：伺服器忙碌`])
  })

  it('409 後重新載入失敗：不重試，提示重新整理', async () => {
    const { state } = await loaded()
    state.setWeekly(1, 2)
    api.saveAssignments.mockRejectedValueOnce({
      response: { status: 409 },
      displayMessage: '部分員工該週已有出勤紀錄，請至「班表與打卡核對」逐日確認班別',
    })
    api.grid.mockRejectedValueOnce(new Error('network'))

    const outcome = await state.save()

    expect(api.saveAssignments).toHaveBeenCalledTimes(1)
    expect(outcome.errors.some((msg) => msg.includes('重新載入失敗'))).toBe(true)
  })
})

describe('useScheduleGrid 寫入後重抓繞過 apiDedupe（QA P3）', () => {
  it('第一次載入走去重；同一週重抓（儲存後、revision）帶 force，不領在途的舊快照', async () => {
    const { state } = await loaded()
    expect(api.grid.mock.calls[0]).toHaveLength(1)
    await state.reload()
    expect(api.grid).toHaveBeenLastCalledWith({ start_date: W1, end_date: WEEK[6] }, { force: true })
    expect(api.getAssignments).toHaveBeenLastCalledWith({ week_start: W1 }, { force: true })
  })
})
