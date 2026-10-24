import type { ApiResponse } from '@/api/_generated/typed'
import type { ReviewEdit } from './attendanceBatchReview'
import { parseTaipeiDate, taipeiDayKey } from './taipeiTime'
export type ScheduleReviewRow = ApiResponse<'/attendance/upload/preview', 'post'>['rows'][number]
type MonthDay = ApiResponse<'/attendance/month-context', 'get'>['days'][number]
export type ReviewScheduleDay = Pick<MonthDay, 'date' | 'schedule_known' | 'is_expected_workday' | 'expected_start_at' | 'expected_end_at'> & { has_leave: boolean }
export type ScheduleHint = { kind: 'eligible' | 'manual'; reason: string; schedule: string; edit: ReviewEdit | null }
export const SCHEDULE_WINDOW_MINUTES = 60
const WINDOW_MS = SCHEDULE_WINDOW_MINUTES * 60_000

export function reviewFingerprint(row: ScheduleReviewRow): string {
  return JSON.stringify([row.matched_employee_id, row.source_employee_number, row.device_id, row.date, row.source_rows, row.punches])
}
export function isCurrentScheduleRow(row: ScheduleReviewRow, year: number, month: number): boolean {
  return Number.isInteger(row.matched_employee_id) && (row.matched_employee_id ?? 0) > 0
    && !!row.date && row.date.startsWith(`${year}-${String(month).padStart(2, '0')}-`)
    && taipeiDayKey(`${row.date}T00:00:00`) === row.date
}
export function manualScheduleHint(reason: string, schedule = ''): ScheduleHint {
  return { kind: 'manual', reason, schedule, edit: null }
}
function sameDayTimestamp(value: string | null | undefined, date: string): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:\+08:00)?$/.test(value)) return null
  if (value.slice(0, 10) !== date || taipeiDayKey(value) !== date) return null
  return parseTaipeiDate(value)?.getTime() ?? null
}
export function classifyScheduleReview(row: ScheduleReviewRow, day: ReviewScheduleDay | undefined, year: number, month: number): ScheduleHint {
  if (!row.matched_employee_id) return manualScheduleHint('尚未對照員工')
  if (!isCurrentScheduleRow(row, year, month)) return manualScheduleHint('不在選定月份或日期無效')
  const schedule = day?.expected_start_at && day.expected_end_at ? `${day.expected_start_at.slice(11, 16)} ～ ${day.expected_end_at.slice(11, 16)}` : ''
  if (!day || !day.schedule_known) return manualScheduleHint('沒有可用班表', schedule)
  if (day.has_leave) return manualScheduleHint('當日有核准請假，請人工核對', schedule)
  if (!day.is_expected_workday) return manualScheduleHint('當日非應出勤日，請人工核對', schedule)
  const start = sameDayTimestamp(day.expected_start_at, row.date!)
  const end = sameDayTimestamp(day.expected_end_at, row.date!)
  if (day.date !== row.date || start === null || end === null || end <= start) return manualScheduleHint('班表跨日或時間無效', schedule)
  if (start + WINDOW_MS >= end - WINDOW_MS) return manualScheduleHint('上下班判讀範圍重疊或相接，請人工核對', schedule)
  const punches = row.punches ?? []
  if (!punches.length) return manualScheduleHint('沒有原始刷卡可核對', schedule)
  const inTimes: string[] = []; const outTimes: string[] = []
  for (const punch of punches) {
    const time = sameDayTimestamp(punch, row.date!)
    if (time === null) return manualScheduleHint('原始刷卡跨日或時間無效', schedule)
    if (Math.abs(time - start) <= WINDOW_MS) inTimes.push(punch.slice(11, 16))
    else if (Math.abs(time - end) <= WINDOW_MS) outTimes.push(punch.slice(11, 16))
    else return manualScheduleHint('有刷卡落在班表判讀範圍外', schedule)
  }
  if (!outTimes.length) return manualScheduleHint('疑似缺下班卡', schedule)
  if (!inTimes.length) return manualScheduleHint('疑似缺上班卡', schedule)
  inTimes.sort(); outTimes.sort()
  return { kind: 'eligible', reason: '上下班兩側刷卡皆在班表判讀範圍內', schedule,
    edit: { punch_in: inTimes[0]!, punch_out: outTimes[outTimes.length - 1]!, confirmed: true } }
}

export function proposeScheduleReview(row: ScheduleReviewRow, edit: ReviewEdit, hint: ScheduleHint | undefined, manuallyEdited = false): { edit: ReviewEdit | null; error: string } {
  if (!hint?.edit || hint.kind !== 'eligible') return { edit: null, error: hint?.reason || '請先載入可採用的班表建議' }
  if (manuallyEdited || edit.punch_in !== (row.punch_in ?? '') || edit.punch_out !== (row.punch_out ?? '')) return { edit: null, error: '已個別調整時間，保留人工選擇' }
  return { edit: { ...hint.edit }, error: '' }
}
