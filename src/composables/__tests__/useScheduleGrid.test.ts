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
})
