import { describe, it, expect } from 'vitest'
import {
  formatWeekday,
  formatTimeRange,
  formatAgeRange,
  hasScheduleConflict,
  collectBusySlots,
  buildConflictCourseIds,
} from '@/parent/utils/activitySchedule'

describe('formatWeekday', () => {
  it('0=週一 .. 6=週日（後端 meeting_weekday 慣例）', () => {
    expect(formatWeekday(0)).toBe('週一')
    expect(formatWeekday(2)).toBe('週三')
    expect(formatWeekday(6)).toBe('週日')
  })
  it('null/undefined/超範圍 → 空字串（不顯示）', () => {
    expect(formatWeekday(null)).toBe('')
    expect(formatWeekday(undefined)).toBe('')
    expect(formatWeekday(7)).toBe('')
  })
})

describe('formatTimeRange', () => {
  it('起訖皆有 → "15:30–16:30"', () => {
    expect(formatTimeRange('15:30', '16:30')).toBe('15:30–16:30')
  })
  it('缺任一端 → 空字串', () => {
    expect(formatTimeRange('15:30', null)).toBe('')
    expect(formatTimeRange(null, '16:30')).toBe('')
    expect(formatTimeRange(null, null)).toBe('')
  })
})

describe('formatAgeRange', () => {
  it('月齡轉歲，整數歲不帶小數', () => {
    expect(formatAgeRange(36, 72)).toBe('3–6 歲')
  })
  it('非整數歲保留一位小數', () => {
    expect(formatAgeRange(30, 72)).toBe('2.5–6 歲')
  })
  it('只有下限 → "X 歲以上"', () => {
    expect(formatAgeRange(36, null)).toBe('3 歲以上')
  })
  it('只有上限 → "X 歲以下"', () => {
    expect(formatAgeRange(null, 72)).toBe('6 歲以下')
  })
  it('皆無 → 空字串', () => {
    expect(formatAgeRange(null, null)).toBe('')
  })
})

describe('hasScheduleConflict', () => {
  const base = { meeting_weekday: 2, meeting_start_time: '15:00', meeting_end_time: '16:00' }
  it('同星期且時間重疊 → 衝突', () => {
    expect(
      hasScheduleConflict(base, {
        meeting_weekday: 2,
        meeting_start_time: '15:30',
        meeting_end_time: '16:30',
      }),
    ).toBe(true)
  })
  it('同星期但時間相接（邊界不算重疊） → 不衝突', () => {
    expect(
      hasScheduleConflict(base, {
        meeting_weekday: 2,
        meeting_start_time: '16:00',
        meeting_end_time: '17:00',
      }),
    ).toBe(false)
  })
  it('不同星期 → 不衝突', () => {
    expect(
      hasScheduleConflict(base, {
        meeting_weekday: 3,
        meeting_start_time: '15:00',
        meeting_end_time: '16:00',
      }),
    ).toBe(false)
  })
  it('任一缺 weekday 或時間 → 無法判定，不衝突', () => {
    expect(hasScheduleConflict(base, { meeting_weekday: null })).toBe(false)
    expect(
      hasScheduleConflict(base, {
        meeting_weekday: 2,
        meeting_start_time: '15:30',
        meeting_end_time: null,
      }),
    ).toBe(false)
  })
})

describe('collectBusySlots', () => {
  it('只收已佔位（enrolled / promoted_pending）課程時段', () => {
    const regs = [
      {
        courses: [
          { status: 'enrolled', meeting_weekday: 2, meeting_start_time: '15:00', meeting_end_time: '16:00' },
          { status: 'waitlist', meeting_weekday: 3, meeting_start_time: '15:00', meeting_end_time: '16:00' },
          { status: 'promoted_pending', meeting_weekday: 4, meeting_start_time: '15:00', meeting_end_time: '16:00' },
        ],
      },
    ]
    const slots = collectBusySlots(regs)
    expect(slots.map((s) => s.meeting_weekday)).toEqual([2, 4]) // waitlist 不算
  })
})

describe('buildConflictCourseIds', () => {
  it('回傳與已佔位時段衝突的目錄課程 id 集合', () => {
    const catalog = [
      { id: 1, meeting_weekday: 2, meeting_start_time: '15:30', meeting_end_time: '16:30' }, // 衝
      { id: 2, meeting_weekday: 5, meeting_start_time: '15:30', meeting_end_time: '16:30' }, // 不衝
    ]
    const busy = [{ meeting_weekday: 2, meeting_start_time: '15:00', meeting_end_time: '16:00' }]
    const ids = buildConflictCourseIds(catalog, busy)
    expect(ids.has(1)).toBe(true)
    expect(ids.has(2)).toBe(false)
  })
})
