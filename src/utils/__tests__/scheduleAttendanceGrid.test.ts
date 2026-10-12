import { describe, it, expect } from 'vitest'
import {
  addDaysISO,
  cellDisplay,
  cellKey,
  chunk,
  confirmUnits,
  coverageInputs,
  findPairCell,
  indexCells,
  isIssue,
  mondayOf,
  monthRange,
  planText,
  planWeekChange,
  rowMatchesFilter,
  visibleDays,
} from '../scheduleAttendanceGrid'
import { cell, day, employee, grid, W1, WEEK } from '@/components/schedule-attendance/__tests__/gridFixtures'
import { computeWeekCoverage } from '@/utils/scheduleCoverage'

const TODAY = '2026-09-17' // 週四

describe('日期工具', () => {
  it('週一對齊、加減天數跨月、月份範圍', () => {
    expect(mondayOf('2026-09-20')).toBe('2026-09-14')
    expect(mondayOf('2026-09-14')).toBe('2026-09-14')
    expect(addDaysISO('2026-09-28', 7)).toBe('2026-10-05')
    expect(monthRange('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(monthRange('2026-10-31')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })
})

describe('cellDisplay（§2.2）', () => {
  it('不在職、未來日、無打卡權限', () => {
    expect(cellDisplay(cell(1, W1, { employed: false }), TODAY).state).toBe('not_employed')
    const future = cellDisplay(cell(1, '2026-09-18', { actual: {} }), TODAY)
    expect(future.state).toBe('future')
    expect(future.actual).toBeNull()
    expect(cellDisplay(cell(1, W1), TODAY).state).toBe('masked')
  })

  it('今天：只有上班卡＝上班中、沒打卡＝尚未打卡，都不判缺勤', () => {
    const working = cellDisplay(cell(1, TODAY, { actual: { punch_in: `${TODAY}T07:01:00`, status: 'missing_punch' } }), TODAY)
    expect(working.state).toBe('working')
    expect(working.verdict).toEqual({ label: '上班中', tone: 'info' })
    expect(working.actual).toBe('07:01–—')
    const notYet = cellDisplay(cell(1, TODAY, { actual: { status: 'data_incomplete' } }), TODAY)
    expect(notYet.verdict?.label).toBe('尚未打卡')
  })

  it('今天全天已核准假且沒打卡：顯示假別而非尚未打卡；待審假仍是尚未打卡', () => {
    const fullLeave = { leave_id: 9, leave_type_label: '特休', is_full_day: true, start_time: null, end_time: null }
    const onLeave = cellDisplay(cell(1, TODAY, { actual: { status: 'leave' }, leaves: [{ ...fullLeave, status: 'approved' }] }), TODAY)
    expect(onLeave.state).toBe('full_leave')
    expect(onLeave.verdict?.label).toBe('特休')
    const pending = cellDisplay(cell(1, TODAY, { actual: { status: 'data_incomplete' }, leaves: [{ ...fullLeave, status: 'pending' }] }), TODAY)
    expect(pending.state).toBe('not_punched')
    expect(pending.verdict?.label).toBe('尚未打卡')
  })

  it('全天已核准假：主文字為假別；判定依狀態著色', () => {
    const leave = cellDisplay(
      cell(1, W1, {
        actual: { status: 'leave' },
        leaves: [{ leave_id: 9, leave_type_label: '特休', status: 'approved', is_full_day: true, start_time: null, end_time: null }],
      }),
      TODAY,
    )
    expect(leave.state).toBe('full_leave')
    expect(leave.verdict?.label).toBe('特休')
    const late = cellDisplay(
      cell(1, W1, { actual: { punch_in: `${W1}T08:30:00`, punch_out: `${W1}T18:00:00`, status: 'anomaly' } }),
      TODAY,
    )
    expect(late).toMatchObject({ state: 'judged', actual: '08:30–18:00', verdict: { label: '出勤異常', tone: 'danger' } })
  })

  it('計畫文字與來源標籤、封存標記', () => {
    expect(planText(cell(1, W1, { plan: { day_off: true, expected: false, source: 'daily_off' } }))).toBe('排休')
    expect(planText(cell(1, '2026-09-19', { plan: { expected: false } }))).toBe('非應出勤日')
    expect(planText(cell(1, W1, { plan: { name: null, shift_type_id: null, source: 'default', work_start: '08:00', work_end: '17:00' } }))).toBe('預設工時 08:00–17:00')
    const swap = cellDisplay(cell(1, W1, { plan: { source: 'swap' }, edit: { locked_reason: 'finalized', plan: false } }), TODAY)
    expect(swap.source).toEqual({ short: '換', label: '換班' })
    expect(swap.locked).toBe(true)
  })
})

describe('篩選', () => {
  it('只看有問題：過去日非符合／非請假／非休，或老師確認仍在處理', () => {
    expect(isIssue(cell(1, W1, { actual: { status: 'anomaly' } }), TODAY)).toBe(true)
    expect(isIssue(cell(1, W1, { actual: { status: 'matched' } }), TODAY)).toBe(false)
    expect(isIssue(cell(1, TODAY, { actual: { status: 'missing_punch' } }), TODAY)).toBe(false)
    expect(
      isIssue(cell(1, W1, { actual: {}, confirmation: { item_id: 1, round_id: 1, kind: 'swap', status: 'pending', partner_employee_id: 2 } }), TODAY),
    ).toBe(true)
    expect(
      isIssue(cell(1, W1, { actual: {}, confirmation: { item_id: 1, round_id: 1, kind: 'swap', status: 'applied', partner_employee_id: 2 } }), TODAY),
    ).toBe(false)
  })

  it('列層級：issues／future／all', () => {
    const rows = [cell(1, W1, { actual: { status: 'matched' } }), cell(1, '2026-09-18', { edit: { plan: true } })]
    expect(rowMatchesFilter(rows, 'issues', TODAY)).toBe(false)
    expect(rowMatchesFilter(rows, 'future', TODAY)).toBe(true)
    expect(rowMatchesFilter([cell(1, '2026-09-18', { edit: { plan: false } })], 'future', TODAY)).toBe(false)
    expect(rowMatchesFilter([], 'all', TODAY)).toBe(true)
  })

  it('週末欄只在有人應出勤或有打卡時顯示', () => {
    const days = WEEK.map((d) => day(d))
    const quiet = visibleDays(days, WEEK.map((d) => cell(1, d, { plan: { expected: day(d).is_workday } })))
    expect(quiet.map((d) => d.date)).toEqual(WEEK.slice(0, 5))
    const saturdayPunch = visibleDays(days, [
      cell(1, '2026-09-19', { plan: { expected: false }, actual: { punch_in: '2026-09-19T09:00:00' } }),
    ])
    expect(saturdayPunch.map((d) => d.date)).toContain('2026-09-19')
  })

  it('showAll 為真（可排班者）時一律回傳全部 7 天，週末沒人排班也要有入口', () => {
    const days = WEEK.map((d) => day(d))
    const quiet = WEEK.map((d) => cell(1, d, { plan: { expected: day(d).is_workday } }))
    expect(visibleDays(days, quiet, true).map((d) => d.date)).toEqual(WEEK)
    expect(visibleDays(days, quiet, false).map((d) => d.date)).toEqual(WEEK.slice(0, 5))
    expect(visibleDays(days, quiet).map((d) => d.date)).toEqual(WEEK.slice(0, 5))
  })
})

describe('planWeekChange（§4 整週拆分）', () => {
  const days = WEEK.map((d) => day(d))

  it('整週沒有已打卡日：直接送週排班', () => {
    expect(planWeekChange(WEEK.map((d) => cell(1, d)), days)).toEqual({
      weekly: true, dailyDates: [], confirmDates: [], blockedDates: [],
    })
  })

  it('部分已打卡：未打卡工作日→每日調整、已打卡可確認→批次確認、其餘略過', () => {
    const weekCells = [
      cell(1, WEEK[0], { actual: {}, edit: { recorded: true, confirm: true, plan: false, locked_reason: 'recorded' } }),
      cell(1, WEEK[1], { actual: {}, edit: { recorded: true, confirm: false, plan: false, locked_reason: 'self' } }),
      cell(1, WEEK[2], { edit: { plan: true } }),
      cell(1, WEEK[3], { plan: { source: 'daily' }, edit: { plan: true } }),
      cell(1, WEEK[4], { employed: false, edit: { plan: false, locked_reason: 'not_employed' } }),
      cell(1, WEEK[5], { plan: { expected: false } }),
      cell(1, WEEK[6], { plan: { expected: false } }),
    ]
    expect(planWeekChange(weekCells, days)).toEqual({
      weekly: false,
      dailyDates: [WEEK[2]],
      confirmDates: [WEEK[0]],
      blockedDates: [WEEK[1]],
    })
  })

  it('已打卡但看不到核對版本（無 ATTENDANCE_READ）一律列為無法確認', () => {
    const weekCells = [cell(1, WEEK[0], { edit: { recorded: true, confirm: true, plan: false } })]
    expect(planWeekChange(weekCells, days).blockedDates).toEqual([WEEK[0]])
  })
})

describe('批次確認單位與配對', () => {
  it('confirmUnits 帶版本、缺版本者略過；chunk 分批', () => {
    const cells = indexCells([cell(1, WEEK[0], { actual: { version: 'b'.repeat(64) } }), cell(1, WEEK[1])])
    expect(confirmUnits(cells, 1, [WEEK[0], WEEK[1]], 2)).toEqual([
      { items: [{ employee_id: 1, date: WEEK[0], shift_type_id: 2, day_off: false, version: 'b'.repeat(64) }] },
    ])
    expect(confirmUnits(cells, 1, [WEEK[0]], null)[0].items[0]).toMatchObject({ shift_type_id: null, day_off: true })
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(cellKey(3, W1)).toBe(`3|${W1}`)
  })

  it('findPairCell：同日唯一一位疑似換班且候選含本人原班別', () => {
    const me = cell(1, W1, { actual: { status: 'possible_shift_change', original_shift_type_id: 1 } })
    const partner = cell(2, W1, {
      actual: {
        status: 'possible_shift_change',
        original_shift_type_id: 2,
        candidates: [{ shift_type_id: 1, name: '早車', work_start: '07:00', work_end: '16:30' }],
      },
    })
    expect(findPairCell(me, 2, [me, partner])).toBe(partner)
    expect(findPairCell(me, 0, [me, partner])).toBeNull()
    const another = { ...partner, employee_id: 3 }
    expect(findPairCell(me, 2, [me, partner, another])).toBeNull()
  })
})

describe('coverageInputs', () => {
  it('每日調整／換班／排休轉成 dailyOverrides，請假帶員工姓名', () => {
    const g = grid({
      employees: [employee(1, '林班導'), employee(2, '王副導')],
      cells: [
        cell(1, W1, { plan: { source: 'daily_off', day_off: true } }),
        cell(2, W1, {
          plan: { source: 'swap', shift_type_id: 2 },
          leaves: [{ leave_id: 5, leave_type_label: '事假', status: 'pending', is_full_day: false, start_time: '13:00', end_time: null }],
        }),
        cell(2, WEEK[1]),
      ],
    })
    const inputs = coverageInputs(g, { 1: 1, 2: 1 })
    expect(inputs.dailyOverrides).toEqual([
      { employee_id: 1, date: W1, shift_type_id: null },
      { employee_id: 2, date: W1, shift_type_id: 2 },
    ])
    expect(inputs.leaves).toEqual([
      expect.objectContaining({ id: 5, employee_name: '王副導', start_date: W1, end_date: W1, start_time: '13:00', end_time: null, status: 'pending' }),
    ])
    expect(inputs.shiftTypes[0]).toEqual({ id: 1, name: '早車', work_start: '07:00', work_end: '16:30' })
  })

  it('fromPlan：週排班／輪值來源的格子也計入 dailyOverrides（沒有 SCHEDULE 取不到週排班時）', () => {
    const g = grid({
      employees: [employee(1, '林班導'), employee(2, '王副導'), employee(3, '陳老師')],
      cells: [
        cell(1, W1, { plan: { source: 'weekly', shift_type_id: 1 } }),
        cell(2, W1, { plan: { source: 'rotation', shift_type_id: 2 } }),
        cell(3, W1, { plan: { source: 'employee', shift_type_id: 1 } }),
        cell(3, WEEK[1], { plan: { source: 'weekly', shift_type_id: null } }),
      ],
    })
    const none = { 1: null, 2: null, 3: null }
    expect(coverageInputs(g, none).dailyOverrides).toEqual([])
    expect(coverageInputs(g, none, { fromPlan: false }).dailyOverrides).toEqual([])
    expect(coverageInputs(g, none, { fromPlan: true }).dailyOverrides).toEqual([
      { employee_id: 1, date: W1, shift_type_id: 1 },
      { employee_id: 2, date: W1, shift_type_id: 2 },
      { employee_id: 3, date: WEEK[1], shift_type_id: null },
    ])
  })

  it('fromPlan 的空班結果等於有週排班時的結果（審查 P4：早車 1 人週排班、1 人每日調整且全天請假）', () => {
    const wed = WEEK[2]
    const g = grid({
      employees: [employee(1, '林班導'), employee(2, '王副導')],
      cells: [
        ...WEEK.map((d) => cell(1, d, { plan: { expected: day(d).is_workday, source: 'weekly', shift_type_id: 1 } })),
        ...WEEK.map((d) =>
          d === wed
            ? cell(2, d, {
                plan: { expected: true, source: 'daily', shift_type_id: 1 },
                leaves: [{ leave_id: 9, leave_type_label: '特休', status: 'approved', is_full_day: true, start_time: null, end_time: null }],
              })
            : cell(2, d, { plan: { expected: day(d).is_workday, source: 'weekly', shift_type_id: 1 } }),
        ),
      ],
    })
    const gapsOn = (weekly: Record<number, number | null>, fromPlan: boolean) =>
      computeWeekCoverage({ dates: WEEK, ...coverageInputs(g, weekly, { fromPlan }) }).find((c) => c.date === wed)!.gaps
    // 有 SCHEDULE：週排班取自 assignments，早車仍有林班導 → 不報
    expect(gapsOn({ 1: 1, 2: 1 }, false)).toEqual([])
    // 沒有 SCHEDULE、不用 fromPlan：週排班全 null，只剩請假的那一位 → 誤報空班
    expect(gapsOn({ 1: null, 2: null }, false)).toHaveLength(1)
    // 沒有 SCHEDULE、fromPlan：改由每格計畫推算 → 與有週排班時相同
    expect(gapsOn({ 1: null, 2: null }, true)).toEqual([])
  })
})
