import { describe, it, expect } from 'vitest'
import { classifyScheduleReview, type ReviewScheduleDay, type ScheduleReviewRow } from '../attendanceScheduleReview'
const day: ReviewScheduleDay = { date: '2026-06-01', schedule_known: true, is_expected_workday: true, expected_start_at: '2026-06-01T08:00:00+08:00', expected_end_at: '2026-06-01T17:00:00+08:00', has_leave: false }
function row(times = ['07:00:00', '09:00:00', '16:00:00', '18:00:00']): ScheduleReviewRow {
  return { row_num: 2, employee_number: 'T1', employee_name: '測試', matched_employee_id: 1, date: day.date, punches: times.map(t => `${day.date}T${t}`), check: 'importable', punch_in: '07:00', punch_out: '18:00' }
}
describe('班表輔助核對', () => {
  it('上下班各60分鐘含端點，取各自最早上班與最晚下班', () => {
    expect(classifyScheduleReview(row(), day, 2026, 6)).toMatchObject({ kind: 'eligible', edit: { punch_in: '07:00', punch_out: '18:00', confirmed: true } })
  })
  it('晚班按班表分組而不是中午分界', () => {
    expect(classifyScheduleReview(row(['13:00:00', '13:10:00', '22:00:00']), { ...day, expected_start_at: '2026-06-01T14:00:00+08:00', expected_end_at: '2026-06-01T21:00:00+08:00' }, 2026, 6)).toMatchObject({ kind: 'eligible', edit: { punch_in: '13:00', punch_out: '22:00' } })
  })
  it.each([['07:00:00', '08:10:00', '疑似缺下班卡'], ['16:30:00', '17:00:00', '疑似缺上班卡']])('兩筆同側仍須人工：%s %s', (a, b, reason) => {
    expect(classifyScheduleReview(row([a, b]), day, 2026, 6)).toMatchObject({ kind: 'manual', reason, edit: null })
  })
  it.each([
    ['視窗相接', { ...day, expected_end_at: '2026-06-01T10:00:00+08:00' }],
    ['短班重疊', { ...day, expected_end_at: '2026-06-01T09:00:00+08:00' }],
    ['跨日班表', { ...day, expected_end_at: '2026-06-02T02:00:00+08:00' }],
    ['倒序', { ...day, expected_end_at: '2026-06-01T07:00:00+08:00' }],
    ['部分或整日請假', { ...day, has_leave: true }],
    ['非應出勤', { ...day, is_expected_workday: false }],
    ['班表未知', { ...day, schedule_known: false }],
    ['無班表', undefined],
  ])('%s不提供採用建議', (_label, schedule) => {
    const result = classifyScheduleReview(row(), schedule, 2026, 6)
    expect(result.kind).toBe('manual'); expect(result.edit).toBeNull(); expect(result.reason).toBeTruthy()
  })
  it.each([
    { ...row(), matched_employee_id: null },
    { ...row(), date: '2026-05-31' },
    { ...row(), punches: ['2026-06-02T08:00:00', '2026-06-01T17:00:00'] },
    { ...row(), punches: ['2026-06-01T25:00:00'] },
    { ...row(), punches: ['2026-02-30T08:00:00'] },
    row(['06:59:59', '17:00:00']), row(['08:00:00', '18:00:01']), row(['08:00:00', '12:00:00', '17:00:00']), row([]),
  ])('未映射、跨月、跨日、無效或範圍外原始刷卡保留人工', invalid => {
    const result = classifyScheduleReview(invalid, day, 2026, 6)
    expect(result.kind).toBe('manual'); expect(result.reason).toBeTruthy(); expect(result.edit).toBeNull()
  })
})
