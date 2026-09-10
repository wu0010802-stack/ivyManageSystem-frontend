import { describe, it, expect } from 'vitest'
import { buildAttendanceMonthRows } from '@/utils/attendanceMonthRows'
import type { ApiResponse } from '@/api/_generated/typed'
type Day = ApiResponse<'/attendance/month-context', 'get'>['days'][number]
const day: Day = { date: '2026-09-10', is_expected_workday: true, schedule_known: true, expected_start_at: '2026-09-10T08:00:00+08:00', expected_end_at: '2026-09-10T17:00:00+08:00', full_day_leave: false, approved_leaves: [] }
const at = (time: string) => Date.parse(`2026-09-10T${time}:00+08:00`)
describe('月份出勤日期與狀態', () => {
  it.each([['07:00', '尚未到班時段'], ['10:00', '尚未完成打卡'], ['17:00', '缺卡待確認']])('%s 正確區分班表進度', (time, status) => {
    const row = buildAttendanceMonthRows([day], [], at(time))[0]!
    expect(row.status).toBe(status)
    expect(row.record).toBeNull()
    expect(row.canSupplement).toBe(status === '缺卡待確認')
  })
  it('未來應上班日不推論缺卡', () => {
    expect(buildAttendanceMonthRows([day], [], Date.parse('2026-09-09T23:59:00+08:00'))[0]!.status).toBe('尚未到班日')
  })
  it('跨夜班依次日下班時間判定', () => {
    const night = { ...day, expected_start_at: '2026-09-10T22:00:00+08:00', expected_end_at: '2026-09-11T06:00:00+08:00' }
    expect(buildAttendanceMonthRows([night], [], Date.parse('2026-09-11T02:00:00+08:00'))[0]!.status).toBe('尚未完成打卡')
    const ended = buildAttendanceMonthRows([night], [], Date.parse('2026-09-11T06:00:00+08:00'))[0]!
    expect(ended.status).toBe('缺卡待確認')
    expect(ended.expectedLabel).toContain('次日 06:00')
  })
  it('未知班表不合成缺卡或提供補卡', () => {
    const row = buildAttendanceMonthRows([{ ...day, schedule_known: false, expected_start_at: null, expected_end_at: null }], [], at('20:00'))[0]!
    expect(row.status).toBe('班表待確認'); expect(row.canSupplement).toBe(false)
  })
  it('完整核准假單優先，部分請假仍檢查剩餘工時', () => {
    const leave = { leave_type: 'annual', start_date: day.date, end_date: day.date, start_time: '08:00', end_time: '12:00', is_full_day: false }
    const partial = buildAttendanceMonthRows([{ ...day, approved_leaves: [leave] }], [], at('20:00'))[0]!
    expect(partial.status).toBe('缺卡待確認'); expect(partial.leaveLabel).toContain('特休（08:00–12:00）')
    const full = buildAttendanceMonthRows([{ ...day, full_day_leave: true, approved_leaves: [{ ...leave, is_full_day: true }] }], [], at('20:00'))[0]!
    expect(full.status).toBe('已核准請假'); expect(full.canSupplement).toBe(false)
  })
  it('休息日無紀錄不顯示，有真實打卡仍保留且翻譯狀態', () => {
    const rest = { ...day, is_expected_workday: false, expected_start_at: null, expected_end_at: null }
    expect(buildAttendanceMonthRows([rest], [], at('20:00'))).toEqual([])
    const record = { id: 9, date: day.date, punch_in: '08:00', punch_out: '17:00', status: 'normal', is_late: false, is_early_leave: false } as ApiResponse<'/attendance/records', 'get'>[number]
    const row = buildAttendanceMonthRows([rest], [record], at('20:00'))[0]!
    expect(row.record?.id).toBe(9); expect(row.status).toBe('非應出勤日打卡')
    expect(buildAttendanceMonthRows([day], [record], at('20:00'))[0]!.status).toBe('正常')
  })
})

it('多日部分請假每天顯示核准時段，不擴張為全天', () => {
  const leave = { leave_type: 'annual', start_date: '2026-09-09', end_date: '2026-09-11', start_time: '08:00', end_time: '10:00', is_full_day: false }
  expect(buildAttendanceMonthRows([{ ...day, approved_leaves: [leave] }], [], at('20:00'))[0]!.leaveLabel).toBe('特休（08:00–10:00）')
})
