import { describe, it, expect } from 'vitest'
import { reconciliationRanges, reconciliationRangeError } from '@/utils/attendanceReconciliationRange'

describe('台北日曆核對範圍', () => {
  it('每月一日不產生反向的本月至昨日範圍', () => {
    const range = reconciliationRanges(2026, 9, '2026-09-01')
    expect(range.elapsed).toBeNull()
    expect(range.today).toEqual({ start: '2026-09-01', end: '2026-09-01' })
    expect(range.week).toEqual({ start: '2026-09-01', end: '2026-09-01' })
  })
  it('過去月為整月，未來月沒有快捷範圍', () => {
    const past = reconciliationRanges(2026, 8, '2026-09-10')
    expect(past.elapsedLabel).toBe('整月')
    expect(past.elapsed).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(past.today).toBeNull()
    expect(past.week).toBeNull()
    const future = reconciliationRanges(2026, 10, '2026-09-10')
    expect(future.today).toBeNull()
    expect(future.week).toBeNull()
    expect(future.elapsed).toBeNull()
  })
  it('跨年本週取所選月份交集，閏年二月月底正確', () => {
    expect(reconciliationRanges(2025, 12, '2026-01-02').week).toEqual({ start: '2025-12-29', end: '2025-12-31' })
    expect(reconciliationRanges(2024, 2, '2024-03-01').elapsed).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })
  it('自訂限制31天且不可跨所選月份或反向', () => {
    expect(reconciliationRangeError('2026-08-01', '2026-08-31', '2026-08-01', '2026-08-31')).toBe('')
    expect(reconciliationRangeError('2026-07-31', '2026-08-31', '2026-08-01', '2026-08-31')).toContain('31 天')
    expect(reconciliationRangeError('2026-07-31', '2026-08-01', '2026-08-01', '2026-08-31')).toContain('目前月份')
    expect(reconciliationRangeError('2026-08-02', '2026-08-01', '2026-08-01', '2026-08-31')).toContain('不可晚於')
  })
})
