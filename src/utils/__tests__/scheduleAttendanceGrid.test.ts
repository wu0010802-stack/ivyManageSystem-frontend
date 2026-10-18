import { describe, it, expect } from 'vitest'
import {
  addDaysISO,
  cellDisplay,
  cellKey,
  chunk,
  confirmUnits,
  coverageInputs,
  findPairCell,
  gridSections,
  groupDaysByWeek,
  outerScrollFirst,
  indexCells,
  importProgress,
  isIssue,
  mondayOf,
  monthCellText,
  monthDot,
  monthRange,
  planText,
  planWeekChange,
  rowMatchesFilter,
  shiftMonthISO,
  uncoveredDates,
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
    expect(working.actual).toBe('07:01 起')
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

  it('格子文字精簡：預設工時只寫時段（「預」標籤已說明來源），非應出勤日不重複寫、也不掛來源', () => {
    const byDefault = cellDisplay(cell(1, W1, { plan: { name: null, shift_type_id: null, source: 'default', work_start: '08:00', work_end: '17:00' } }), TODAY)
    expect(byDefault.plan).toBe('08:00–17:00')
    expect(byDefault.source?.short).toBe('預')
    expect(cellDisplay(cell(1, W1, { plan: { source: 'weekly', name: '早值', work_start: '08:00', work_end: '17:00' } }), TODAY).plan).toBe('早值 08:00–17:00')
    const off = cellDisplay(cell(1, '2026-09-19', { plan: { expected: false, source: 'employee' }, actual: { status: 'off_day' } }), TODAY)
    expect(off.plan).toBe('非應出勤日')
    expect(off.source).toBeNull()
    expect(off.verdict).toBeNull()
    const dayOff = cellDisplay(cell(1, W1, { plan: { expected: false, day_off: true, source: 'daily_off' }, actual: { status: 'off_day' } }), TODAY)
    expect(dayOff.source?.short).toBe('休')
    expect(dayOff.verdict).toBeNull()
  })

  it('出勤異常直接寫遲到／早退分鐘，處理過的接在後面；沒有分鐘才退回「出勤異常」', () => {
    const late = cellDisplay(cell(1, W1, { actual: { status: 'anomaly', punch_in: `${W1}T07:30:00`, punch_out: `${W1}T16:30:00`, late_minutes: 30 } }), TODAY)
    expect(late.verdict).toEqual({ label: '遲到 30 分', tone: 'danger' })
    const both = cellDisplay(cell(1, W1, { actual: { status: 'anomaly', punch_in: `${W1}T07:57:00`, punch_out: `${W1}T11:48:00`, late_minutes: 57, early_leave_minutes: 342 } }), TODAY)
    expect(both.verdict?.label).toBe('遲到 57 分・早退 342 分')
    const early = cellDisplay(cell(1, W1, { actual: { status: 'anomaly', punch_in: `${W1}T07:00:00`, punch_out: `${W1}T16:10:00`, early_leave_minutes: 20 } }), TODAY)
    expect(early.verdict?.label).toBe('早退 20 分')
    const waived = cellDisplay(cell(1, W1, { actual: { status: 'anomaly', punch_in: `${W1}T07:30:00`, punch_out: `${W1}T16:30:00`, late_minutes: 30, confirmed_action: 'admin_waive' } }), TODAY)
    expect(waived.verdict).toEqual({ label: '遲到 30 分・已豁免', tone: 'info' })
    // 疑似換班等其他判定仍寫判定名（分鐘數在抽屜）
    expect(cellDisplay(cell(1, W1, { actual: { status: 'possible_shift_change', punch_in: `${W1}T08:01:00`, punch_out: `${W1}T17:31:00`, late_minutes: 1 } }), TODAY).verdict?.label).toBe('疑似換班')
  })

  it('資料待補（當天已有人匯入）是待處理：用警示色，不是灰字', () => {
    const shown = cellDisplay(cell(1, W1, { actual: { status: 'data_incomplete' } }), TODAY, new Set())
    expect(shown.state).toBe('judged')
    expect(shown.verdict).toEqual({ label: '資料待補', tone: 'warning' })
    expect(isIssue(cell(1, W1, { actual: { status: 'data_incomplete' } }), TODAY, new Set())).toBe(true)
  })

  it('今天不用上班（非應出勤日、排休）沒打卡：不寫「尚未打卡」', () => {
    const off = cellDisplay(cell(1, TODAY, { plan: { expected: false }, actual: { status: 'off_day' } }), TODAY)
    expect(off.verdict).toBeNull()
    expect(off.state).toBe('judged')
    const dayOff = cellDisplay(cell(1, TODAY, { plan: { expected: false, day_off: true, source: 'daily_off' }, actual: { status: 'off_day' } }), TODAY)
    expect(dayOff.verdict).toBeNull()
    // 不用上班但有打卡：今天仍照「上班中」顯示
    expect(cellDisplay(cell(1, TODAY, { plan: { expected: false }, actual: { status: 'unscheduled_attendance', punch_in: `${TODAY}T09:00:00` } }), TODAY).verdict?.label).toBe('上班中')
  })

  it('單邊打卡寫「缺」而不是破折號接破折號；今天上班中寫「起」', () => {
    expect(cellDisplay(cell(1, W1, { actual: { status: 'missing_punch', punch_in: `${W1}T07:52:00`, punch_out: null } }), TODAY).actual).toBe('07:52–缺')
    expect(cellDisplay(cell(1, W1, { actual: { status: 'missing_punch', punch_in: null, punch_out: `${W1}T17:33:00` } }), TODAY).actual).toBe('缺–17:33')
    expect(cellDisplay(cell(1, TODAY, { actual: { punch_in: `${TODAY}T07:01:00`, status: 'missing_punch' } }), TODAY).actual).toBe('07:01 起')
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

describe('已在出勤明細處理過的異常（接受扣款／豁免）', () => {
  it('不再算待處理；格子寫出處理結果、不掛警示', () => {
    const waived = cell(1, W1, { actual: { status: 'anomaly', confirmed_action: 'admin_waive', punch_in: `${W1}T08:30:00`, punch_out: `${W1}T17:00:00` } })
    expect(isIssue(waived, TODAY)).toBe(false)
    expect(cellDisplay(waived, TODAY).verdict).toEqual({ label: '出勤異常・已豁免', tone: 'info' })
    const accepted = cell(1, W1, { actual: { status: 'missing_punch', confirmed_action: 'admin_accept', punch_in: `${W1}T07:52:00`, punch_out: null } })
    expect(isIssue(accepted, TODAY)).toBe(false)
    expect(cellDisplay(accepted, TODAY).verdict?.label).toBe('缺卡待確認・已接受扣款')
    // 疑似換班只「接受扣款」沒回答是不是換班：仍待處理（豁免＝不扣款，才算處理完）（審查 F2）
    const swapAccepted = cell(1, W1, { actual: { status: 'possible_shift_change', confirmed_action: 'admin_accept' } })
    expect(isIssue(swapAccepted, TODAY)).toBe(true)
    expect(cellDisplay(swapAccepted, TODAY).verdict).toEqual({ label: '疑似換班・已接受扣款', tone: 'warning' })
    expect(isIssue(cell(1, W1, { actual: { status: 'possible_shift_change', confirmed_action: 'admin_waive' } }), TODAY)).toBe(false)
    // 老師確認還在進行中：仍算待處理
    expect(isIssue(cell(1, W1, { actual: { status: 'anomaly', confirmed_action: 'admin_waive' }, confirmation: { item_id: 1, round_id: 1, kind: 'swap', status: 'pending', partner_employee_id: 2 } }), TODAY)).toBe(true)
  })
})

describe('整天未匯入打卡（不算待處理）', () => {
  const NONE = { status: 'data_incomplete' as const, punch_in: null, punch_out: null }
  const uncovered = uncoveredDates([day(WEEK[0], { import_covered: false }), day(WEEK[1]), day(WEEK[2], { import_covered: null })])

  it('uncoveredDates 只收 import_covered 明確為 false 的日子（null＝沒有打卡權限，不算）', () => {
    expect([...uncovered]).toEqual([WEEK[0]])
  })

  it('整天都沒匯入的「資料待補」不是待處理；當天有人被匯入就仍是（這個人不在匯入檔裡要人看）', () => {
    expect(isIssue(cell(1, WEEK[0], { actual: NONE }), TODAY, uncovered)).toBe(false)
    expect(isIssue(cell(1, WEEK[1], { actual: NONE }), TODAY, uncovered)).toBe(true)
    expect(isIssue(cell(1, WEEK[0], { actual: { status: 'missing_punch', punch_in: `${WEEK[0]}T07:52:00` } }), TODAY, uncovered)).toBe(true)
    expect(isIssue(cell(1, WEEK[0], { actual: NONE }), TODAY)).toBe(true) // 不給未匯入日＝舊行為
    expect(rowMatchesFilter([cell(1, WEEK[0], { actual: NONE })], 'issues', TODAY, uncovered)).toBe(false)
  })

  it('格子顯示「未匯入」而不是「資料待補」', () => {
    const shown = cellDisplay(cell(1, WEEK[0], { actual: NONE }), TODAY, uncovered)
    expect(shown.state).toBe('awaiting_import')
    expect(shown.verdict).toEqual({ label: '未匯入', tone: 'info' })
    expect(cellDisplay(cell(1, WEEK[1], { actual: NONE }), TODAY, uncovered).verdict?.label).toBe('資料待補')
    // 今天還沒過完：仍是「尚未打卡」，不因為今天還沒匯入就說未匯入
    expect(cellDisplay(cell(1, TODAY, { actual: NONE }), TODAY, new Set([TODAY])).state).toBe('not_punched')
  })

  it('非工作日不套「未匯入」：週末／假日用每日調整排了人卻沒人打卡，這天永遠不會被匯入涵蓋，要留在待處理（審查 F1）', () => {
    const SAT = '2026-09-12' // 上週六（今天 9/17 之前）
    const weekend = uncoveredDates([day(SAT, { import_covered: false })])
    expect(weekend.size).toBe(0)
    expect(isIssue(cell(1, SAT, { plan: { source: 'daily', expected: true }, actual: NONE }), TODAY, weekend)).toBe(true)
  })

  it('整天未匯入但這格有打卡（例如打卡台）：不是「等匯入」，照狀態判定', () => {
    expect(isIssue(cell(1, WEEK[0], { actual: { status: 'data_incomplete', punch_in: `${WEEK[0]}T07:50:00`, punch_out: null } }), TODAY, uncovered)).toBe(true)
  })

  it('importProgress：最後匯入日、它之前的缺口、本月到昨天為止還沒匯入的工作日', () => {
    const days = [
      day('2026-09-21'), day('2026-09-22', { import_covered: false }), day('2026-09-23'),
      day('2026-09-24', { import_covered: false }), day('2026-09-25', { import_covered: false }),
      day('2026-09-26', { import_covered: false }), // 週六：不是工作日，不算缺
      day('2026-09-28', { import_covered: false }), // 今天：還沒過完，不算缺
    ]
    expect(importProgress(days, '2026-09-28')).toEqual({
      lastCovered: '2026-09-23',
      gaps: ['2026-09-22'],
      missingWorkdays: ['2026-09-22', '2026-09-24', '2026-09-25'],
    })
    expect(importProgress([day('2026-10-01', { import_covered: false })], '2026-10-13')).toEqual({ lastCovered: null, gaps: [], missingWorkdays: ['2026-10-01'] })
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

describe('月格子（SPEC-027 C 期）', () => {
  const LEAVE = { leave_id: 1, leave_type_label: '事假', is_full_day: true, status: 'approved' as const, start_time: null, end_time: null }

  it('shiftMonthISO：跨年前後月一律回月初', () => {
    expect(shiftMonthISO('2026-01-31', -1)).toBe('2025-12-01')
    expect(shiftMonthISO('2026-12-15', 1)).toBe('2027-01-01')
    expect(shiftMonthISO('2026-10-13', 0)).toBe('2026-10-01')
  })

  it('groupDaysByWeek：依週一分組；跨月週只含傳入的日子但 monday 是真正的週一', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'].map((d) => day(d))
    const weeks = groupDaysByWeek(days)
    expect(weeks.map((w) => w.monday)).toEqual(['2026-09-28', '2026-10-05'])
    expect(weeks[0].days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02'])
  })

  it('monthCellText：班別名前兩字；預設工時＝預；排休＝休；全天已核准假＝假；非應出勤日與不在職空白', () => {
    expect(monthCellText(cell(1, W1))).toBe('早車')
    expect(monthCellText(cell(1, W1, { plan: { name: '行政全日班' } }))).toBe('行政')
    expect(monthCellText(cell(1, W1, { plan: { source: 'default', name: null } }))).toBe('預')
    expect(monthCellText(cell(1, W1, { plan: { day_off: true } }))).toBe('休')
    expect(monthCellText(cell(1, W1, { leaves: [LEAVE] }))).toBe('假')
    expect(monthCellText(cell(1, W1, { plan: { expected: false } }))).toBe('')
    expect(monthCellText(cell(1, W1, { employed: false }))).toBe('')
  })

  it('monthDot：待處理才給紅／橘（與只看待處理同一定義）；非待處理有假＝藍', () => {
    const today = '2026-09-21'
    expect(monthDot(cell(1, W1, { actual: { status: 'anomaly' } }), today)).toBe('red')
    expect(monthDot(cell(1, W1, { actual: { status: 'missing_punch' } }), today)).toBe('red')
    expect(monthDot(cell(1, W1, { actual: { status: 'suspected_absence' } }), today)).toBe('red')
    expect(monthDot(cell(1, W1, { actual: { status: 'possible_shift_change' } }), today)).toBe('orange')
    expect(monthDot(cell(1, W1, { actual: {}, confirmation: { item_id: 1, kind: 'swap', status: 'pending' } }), today)).toBe('orange')
    // 已豁免＝已處理，不再是紅點
    expect(monthDot(cell(1, W1, { actual: { status: 'anomaly', confirmed_action: 'admin_waive' } }), today)).toBeNull()
    expect(monthDot(cell(1, W1, { actual: { status: 'leave' }, leaves: [LEAVE] }), today)).toBe('blue')
    // 未來日的已排假也標藍
    expect(monthDot(cell(1, '2026-09-25', { leaves: [{ ...LEAVE, status: 'pending' }] }), today)).toBe('blue')
    expect(monthDot(cell(1, W1, { actual: {} }), today)).toBeNull()
    expect(monthDot(cell(1, W1, { employed: false, leaves: [LEAVE] }), today)).toBeNull()
  })

  it('gridSections：依篩選與關鍵字留列、依組分段、空組不出現', () => {
    const g = grid({
      employees: [employee(1, '林班導'), employee(2, '王副導'), employee(3, '陳行政', { group_key: 'other' })],
      cells: [
        cell(1, W1, { actual: { status: 'anomaly' } }),
        cell(2, W1, { actual: {} }),
        cell(3, W1, { actual: {} }),
      ],
    })
    const base = { groups: g.groups, employees: g.employees, days: g.days, cells: indexCells(g.cells), today: g.today }
    expect(gridSections({ ...base, filter: 'all' }).map((s) => [s.group.key, s.employees.map((e) => e.employee_id)])).toEqual([
      ['classroom:1', [1, 2]],
      ['other', [3]],
    ])
    expect(gridSections({ ...base, filter: 'issues' }).map((s) => s.employees.map((e) => e.employee_id))).toEqual([[1]])
    expect(gridSections({ ...base, filter: 'all', keyword: 'e003' }).map((s) => s.group.key)).toEqual(['other'])
  })
})

describe('outerScrollFirst（在格子上捲動時先收起頁首）', () => {
  it('往下捲且工具列還沒貼頂：先捲外層，最多捲到工具列貼頂為止', () => {
    expect(outerScrollFirst({ deltaY: 100, toolbarOffset: 301, outerRoom: 400 })).toBe(100)
    expect(outerScrollFirst({ deltaY: 500, toolbarOffset: 301, outerRoom: 400 })).toBe(301)
    expect(outerScrollFirst({ deltaY: 500, toolbarOffset: 301, outerRoom: 120 })).toBe(120)
  })
  it('工具列已貼頂、外層捲不動、或往上捲：交給格子自己捲', () => {
    expect(outerScrollFirst({ deltaY: 100, toolbarOffset: 0, outerRoom: 400 })).toBe(0)
    expect(outerScrollFirst({ deltaY: 100, toolbarOffset: 0.5, outerRoom: 400 })).toBe(0)
    expect(outerScrollFirst({ deltaY: 100, toolbarOffset: 301, outerRoom: 0 })).toBe(0)
    expect(outerScrollFirst({ deltaY: -100, toolbarOffset: 301, outerRoom: 400 })).toBe(0)
  })
})
