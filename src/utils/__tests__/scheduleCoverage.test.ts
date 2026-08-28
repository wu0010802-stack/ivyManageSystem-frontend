/**
 * 排班頁請假覆蓋／空班判定純邏輯（scheduleCoverage）。
 *
 * 鎖定：
 * - 缺席時窗展開：全天假＝00:00–24:00；時段假只在起訖日收窄，中間日全天
 * - 班別重疊判定：窗與 [work_start, work_end) 有交集才算缺席（邊界相接不算）
 * - 空班：某班別當日排定人數 > 0 且「排定 − 請假重疊」歸零才報；
 *   僅靠 approved 就歸零＝empty，需要算入 pending 才歸零＝risk
 * - 每日調整優先於週指派；day_off（override shift_type_id=null）＝不排班
 */
import { describe, it, expect } from 'vitest'
import {
  leaveWindowForDate,
  leaveCoversShift,
  computeWeekCoverage,
  type LeaveContextItem,
} from '../scheduleCoverage'

let seq = 0
const makeLeave = (over: Partial<LeaveContextItem> = {}): LeaveContextItem => ({
  id: ++seq,
  employee_id: 1,
  employee_name: '王小明',
  leave_type: 'sick',
  leave_type_label: '病假',
  start_date: '2026-09-08',
  end_date: '2026-09-08',
  start_time: null,
  end_time: null,
  status: 'approved',
  ...over,
})

const SHIFT_A = { id: 10, name: '早班', work_start: '07:30', work_end: '16:30' }
const SHIFT_B = { id: 11, name: '晚班', work_start: '10:00', work_end: '19:00' }

describe('leaveWindowForDate', () => {
  it('全天假（無起訖時間）任一涵蓋日都是 00:00–24:00', () => {
    const lv = makeLeave({ start_date: '2026-09-07', end_date: '2026-09-09' })
    expect(leaveWindowForDate(lv, '2026-09-08')).toEqual({ start: '00:00', end: '24:00' })
  })

  it('單日時段假回傳該時段', () => {
    const lv = makeLeave({ start_time: '08:00', end_time: '12:00' })
    expect(leaveWindowForDate(lv, '2026-09-08')).toEqual({ start: '08:00', end: '12:00' })
  })

  it('跨日時段假：首日從 start_time 起、末日到 end_time 止、中間日全天', () => {
    const lv = makeLeave({
      start_date: '2026-09-07',
      end_date: '2026-09-09',
      start_time: '13:00',
      end_time: '10:00',
    })
    expect(leaveWindowForDate(lv, '2026-09-07')).toEqual({ start: '13:00', end: '24:00' })
    expect(leaveWindowForDate(lv, '2026-09-08')).toEqual({ start: '00:00', end: '24:00' })
    expect(leaveWindowForDate(lv, '2026-09-09')).toEqual({ start: '00:00', end: '10:00' })
  })

  it('日期在假單範圍外回 null', () => {
    const lv = makeLeave()
    expect(leaveWindowForDate(lv, '2026-09-09')).toBeNull()
  })
})

describe('leaveCoversShift', () => {
  it('時段假與班別時段有交集＝缺席', () => {
    const lv = makeLeave({ start_time: '08:00', end_time: '12:00' })
    expect(leaveCoversShift(lv, '2026-09-08', SHIFT_A)).toBe(true)
  })

  it('時段假與班別時段無交集＝不缺席', () => {
    const lv = makeLeave({ start_time: '17:00', end_time: '19:00' })
    expect(leaveCoversShift(lv, '2026-09-08', SHIFT_A)).toBe(false)
  })

  it('邊界相接（假結束＝班開始）不算缺席', () => {
    const lv = makeLeave({ start_time: '06:00', end_time: '07:30' })
    expect(leaveCoversShift(lv, '2026-09-08', SHIFT_A)).toBe(false)
  })

  it('全天假覆蓋任何班別', () => {
    const lv = makeLeave()
    expect(leaveCoversShift(lv, '2026-09-08', SHIFT_A)).toBe(true)
    expect(leaveCoversShift(lv, '2026-09-08', SHIFT_B)).toBe(true)
  })

  it('日期不在假單範圍＝不缺席', () => {
    const lv = makeLeave()
    expect(leaveCoversShift(lv, '2026-09-10', SHIFT_A)).toBe(false)
  })
})

describe('computeWeekCoverage', () => {
  const DATES = ['2026-09-07', '2026-09-08']
  const base = {
    dates: DATES,
    employeeIds: [1, 2],
    weeklyShiftByEmp: { 1: SHIFT_A.id, 2: SHIFT_B.id } as Record<number, number | null>,
    dailyOverrides: [],
    shiftTypes: [SHIFT_A, SHIFT_B],
  }

  it('唯一排班者整天請假（approved）→ 該班別報 empty 空班', () => {
    const days = computeWeekCoverage({ ...base, leaves: [makeLeave()] })
    const day = days.find((d) => d.date === '2026-09-08')!
    expect(day.gaps).toHaveLength(1)
    expect(day.gaps[0]).toMatchObject({
      shiftTypeId: SHIFT_A.id,
      shiftTypeName: '早班',
      scheduledCount: 1,
      severity: 'empty',
      absentNames: ['王小明'],
    })
    // 另一天沒人請假 → 無空班
    expect(days.find((d) => d.date === '2026-09-07')!.gaps).toHaveLength(0)
  })

  it('僅靠 pending 歸零 → severity 是 risk', () => {
    const days = computeWeekCoverage({
      ...base,
      leaves: [makeLeave({ status: 'pending' })],
    })
    expect(days.find((d) => d.date === '2026-09-08')!.gaps[0].severity).toBe('risk')
  })

  it('兩人排同班別、只有一人請假 → 不算空班', () => {
    const days = computeWeekCoverage({
      ...base,
      employeeIds: [1, 2, 3],
      weeklyShiftByEmp: { 1: SHIFT_A.id, 2: SHIFT_B.id, 3: SHIFT_A.id },
      leaves: [makeLeave()],
    })
    expect(days.find((d) => d.date === '2026-09-08')!.gaps).toHaveLength(0)
  })

  it('請假時段與班別時段不重疊 → 不算空班，但仍列入當日請假清單', () => {
    const days = computeWeekCoverage({
      ...base,
      leaves: [makeLeave({ start_time: '17:00', end_time: '19:00' })],
    })
    const day = days.find((d) => d.date === '2026-09-08')!
    expect(day.gaps).toHaveLength(0)
    expect(day.leaves).toHaveLength(1)
    expect(day.leaves[0].window).toEqual({ start: '17:00', end: '19:00' })
  })

  it('day_off 每日調整＝當日不排班 → 該班別無人排也不報空班', () => {
    const days = computeWeekCoverage({
      ...base,
      dailyOverrides: [{ employee_id: 1, date: '2026-09-08', shift_type_id: null }],
      leaves: [makeLeave()],
    })
    expect(days.find((d) => d.date === '2026-09-08')!.gaps).toHaveLength(0)
  })

  it('每日調整改班 → 空班判定跟著當日實際班別走', () => {
    const days = computeWeekCoverage({
      ...base,
      employeeIds: [1],
      weeklyShiftByEmp: { 1: SHIFT_A.id },
      dailyOverrides: [{ employee_id: 1, date: '2026-09-08', shift_type_id: SHIFT_B.id }],
      leaves: [makeLeave()],
    })
    const day = days.find((d) => d.date === '2026-09-08')!
    expect(day.gaps).toHaveLength(1)
    expect(day.gaps[0].shiftTypeId).toBe(SHIFT_B.id)
  })

  it('非排班對象（不在 employeeIds）的請假仍列入當日清單、不影響空班', () => {
    const days = computeWeekCoverage({
      ...base,
      leaves: [makeLeave({ employee_id: 99, employee_name: '廚工阿姨' })],
    })
    const day = days.find((d) => d.date === '2026-09-08')!
    expect(day.leaves.map((l) => l.leave.employee_name)).toContain('廚工阿姨')
    expect(day.gaps).toHaveLength(0)
  })

  it('同一員工同日多筆假單，缺席名單不重複計人', () => {
    const days = computeWeekCoverage({
      ...base,
      leaves: [
        makeLeave({ start_time: '07:00', end_time: '12:00' }),
        makeLeave({ start_time: '12:00', end_time: '18:00', leave_type_label: '事假' }),
      ],
    })
    const day = days.find((d) => d.date === '2026-09-08')!
    expect(day.gaps).toHaveLength(1)
    expect(day.gaps[0].absentNames).toEqual(['王小明'])
  })
})
