import { describe, it, expect } from 'vitest'
import {
  formatWeekday,
  formatTimeRange,
  hasScheduleConflict,
  collectBusySlots,
  buildConflictCourseIds,
  countUpcomingWithinDays,
  buildFormConflictCourseIds,
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

describe('countUpcomingWithinDays', () => {
  const today = '2026-06-23'
  const sessions = [
    { student_id: 1, session_date: '2026-06-23' }, // 今天（窗內）
    { student_id: 1, session_date: '2026-06-29' }, // +6（窗內）
    { student_id: 1, session_date: '2026-06-30' }, // +7（含端點，窗內）
    { student_id: 1, session_date: '2026-07-05' }, // +12（窗外）
    { student_id: 2, session_date: '2026-06-24' }, // 別的孩子
  ]
  it('計入 [today, today+days] 含端點，排除窗外', () => {
    expect(countUpcomingWithinDays(sessions, { studentId: 1, days: 7, todayISO: today })).toBe(3)
  })
  it('studentId 篩選只計該孩子', () => {
    expect(countUpcomingWithinDays(sessions, { studentId: 2, days: 7, todayISO: today })).toBe(1)
  })
  it('studentId 省略時計全部', () => {
    expect(countUpcomingWithinDays(sessions, { days: 7, todayISO: today })).toBe(4)
  })
  it('缺 session_date 不計、空陣列回 0', () => {
    expect(countUpcomingWithinDays([{ student_id: 1 }], { studentId: 1, days: 7, todayISO: today })).toBe(0)
    expect(countUpcomingWithinDays([], { days: 7, todayISO: today })).toBe(0)
  })
})

describe('collectBusySlots（學期過濾，code review #6）', () => {
  const regs = [
    {
      school_year: 113,
      semester: 2,
      courses: [
        { status: 'enrolled', meeting_weekday: 2, meeting_start_time: '15:00', meeting_end_time: '16:00' },
      ],
    },
    {
      school_year: 114,
      semester: 1,
      courses: [
        { status: 'enrolled', meeting_weekday: 2, meeting_start_time: '15:00', meeting_end_time: '16:00' },
      ],
    },
  ]
  it('指定學年/學期 → 只收該學期已佔位時段（不跨學期誤報）', () => {
    const slots = collectBusySlots(regs, { schoolYear: 114, semester: 1 })
    expect(slots).toHaveLength(1)
  })
  it('未指定學期 → 不過濾（向後相容）', () => {
    expect(collectBusySlots(regs)).toHaveLength(2)
  })
})

describe('buildFormConflictCourseIds（表單複選互比，code review #6）', () => {
  const catalog = [
    { id: 1, meeting_weekday: 2, meeting_start_time: '15:00', meeting_end_time: '16:00' },
    { id: 2, meeting_weekday: 2, meeting_start_time: '15:30', meeting_end_time: '16:30' }, // 與 1 衝
    { id: 3, meeting_weekday: 5, meeting_start_time: '15:00', meeting_end_time: '16:00' }, // 不衝
  ]
  it('同時勾選兩門互衝課程 → 兩者都標記', () => {
    const ids = buildFormConflictCourseIds(catalog, [1, 2], [])
    expect(ids.has(1)).toBe(true)
    expect(ids.has(2)).toBe(true)
    expect(ids.has(3)).toBe(false)
  })
  it('只勾選一門課 → 不與自己衝堂', () => {
    const ids = buildFormConflictCourseIds(catalog, [1], [])
    expect(ids.has(1)).toBe(false)
  })
  it('與既有 busy 時段衝突的目錄課程也標記（不限已勾選）', () => {
    const busy = [{ meeting_weekday: 2, meeting_start_time: '15:00', meeting_end_time: '16:00' }]
    const ids = buildFormConflictCourseIds(catalog, [], busy)
    expect(ids.has(1)).toBe(true)
    expect(ids.has(2)).toBe(true)
    expect(ids.has(3)).toBe(false)
  })
})
