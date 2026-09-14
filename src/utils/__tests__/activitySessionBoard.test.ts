import { describe, it, expect } from 'vitest'

import {
  courseOptions,
  dayLabel,
  findOverdue,
  groupByDay,
  timeRangeLabel,
  todayInTaipei,
  todaySummary,
  toSessionView,
  weekBounds,
  weekLabel,
  type BoardSession,
} from '../activitySessionBoard'

const TODAY = '2026-09-16' // 週三

function session(over: Partial<BoardSession> & { id: number }): BoardSession {
  return {
    course_id: 1,
    course_name: '跆拳道',
    session_date: TODAY,
    present_count: 0,
    recorded_count: 0,
    enrolled_count: 16,
    meeting_start_time: '16:10:00',
    meeting_end_time: '17:10:00',
    ...over,
  }
}

describe('weekBounds', () => {
  it('本週從週一到週日', () => {
    expect(weekBounds(TODAY)).toEqual({ start: '2026-09-14', end: '2026-09-20' })
  })

  it('週日算在該週的最後一天，不是下一週的第一天', () => {
    expect(weekBounds('2026-09-20')).toEqual({ start: '2026-09-14', end: '2026-09-20' })
  })

  it('週一是該週第一天', () => {
    expect(weekBounds('2026-09-14')).toEqual({ start: '2026-09-14', end: '2026-09-20' })
  })

  it('上週與下週', () => {
    expect(weekBounds(TODAY, -1)).toEqual({ start: '2026-09-07', end: '2026-09-13' })
    expect(weekBounds(TODAY, 1)).toEqual({ start: '2026-09-21', end: '2026-09-27' })
  })

  it('跨月與跨年都不會算錯', () => {
    expect(weekBounds('2026-12-31')).toEqual({ start: '2026-12-28', end: '2027-01-03' })
    expect(weekBounds('2026-03-01')).toEqual({ start: '2026-02-23', end: '2026-03-01' })
  })
})

describe('weekLabel', () => {
  it('是本週時加上「本週」前綴', () => {
    expect(weekLabel('2026-09-14', '2026-09-20', TODAY)).toBe('本週 9/14 至 9/20')
  })

  it('不是本週時只有日期範圍', () => {
    expect(weekLabel('2026-09-07', '2026-09-13', TODAY)).toBe('9/7 至 9/13')
  })
})

describe('dayLabel / timeRangeLabel', () => {
  it('帶星期', () => {
    expect(dayLabel('2026-09-16')).toBe('週三 9/16')
    expect(dayLabel('2026-09-20')).toBe('週日 9/20')
  })

  it('時刻只留時分', () => {
    expect(timeRangeLabel(session({ id: 1 }))).toBe('16:10 至 17:10')
  })

  it('課程沒設時刻時回空字串（不能畫出空的破折號）', () => {
    expect(
      timeRangeLabel(session({ id: 1, meeting_start_time: null, meeting_end_time: null })),
    ).toBe('')
  })

  it('只有開始時刻時不硬湊區間', () => {
    expect(timeRangeLabel(session({ id: 1, meeting_end_time: null }))).toBe('16:10')
  })
})

describe('toSessionView 狀態判定', () => {
  it('已上過但完全沒點＝未點名', () => {
    const view = toSessionView(session({ id: 1, session_date: '2026-09-14' }), TODAY)
    expect(view.status).toBe('unmarked')
    expect(view.isPast).toBe(true)
  })

  it('還沒上的場次＝尚未開始，不算漏點名', () => {
    const view = toSessionView(session({ id: 1, session_date: '2026-09-18' }), TODAY)
    expect(view.status).toBe('upcoming')
  })

  it('點到一半', () => {
    const view = toSessionView(session({ id: 1, recorded_count: 8, present_count: 7 }), TODAY)
    expect(view.status).toBe('partial')
    expect(view.markedCount).toBe(8)
    expect(view.totalCount).toBe(16)
  })

  it('點完＝已完成', () => {
    const view = toSessionView(session({ id: 1, recorded_count: 16, present_count: 15 }), TODAY)
    expect(view.status).toBe('done')
  })

  it('分母用應到人數，不是已記錄人數', () => {
    // 這正是改版要修的：舊契約只有 recorded_count，18 人裡點了 16 個會被當成點完
    const view = toSessionView(
      session({ id: 1, recorded_count: 16, present_count: 16, enrolled_count: 18 }),
      TODAY,
    )
    expect(view.status).toBe('partial')
    expect(view.totalCount).toBe(18)
  })

  it('後端沒回應到人數時退回舊行為，不會把已點完的誤判成點一半', () => {
    const view = toSessionView(
      session({ id: 1, recorded_count: 16, present_count: 16, enrolled_count: undefined }),
      TODAY,
    )
    expect(view.status).toBe('done')
    expect(view.totalCount).toBe(16)
  })

  it('今天的場次標為今天', () => {
    expect(toSessionView(session({ id: 1 }), TODAY).isToday).toBe(true)
    expect(toSessionView(session({ id: 2, session_date: '2026-09-15' }), TODAY).isToday).toBe(false)
  })
})

describe('groupByDay', () => {
  it('依日期升冪、組內依上課時刻排序', () => {
    const views = [
      session({ id: 1, session_date: '2026-09-16', meeting_start_time: '16:10:00', course_name: '跆拳道' }),
      session({ id: 2, session_date: '2026-09-14', meeting_start_time: '15:40:00', course_name: '幼兒創意美術' }),
      session({ id: 3, session_date: '2026-09-16', meeting_start_time: '16:00:00', course_name: '幼兒體適能' }),
    ].map((s) => toSessionView(s, TODAY))

    const groups = groupByDay(views)

    expect(groups.map((g) => g.date)).toEqual(['2026-09-14', '2026-09-16'])
    expect(groups[0].label).toBe('週一 9/14')
    expect(groups[1].sessions.map((s) => s.course_name)).toEqual(['幼兒體適能', '跆拳道'])
  })

  it('沒有日期的場次不會生出空白分組', () => {
    const views = [session({ id: 1, session_date: null })].map((s) => toSessionView(s, TODAY))
    expect(groupByDay(views)).toEqual([])
  })
})

describe('findOverdue', () => {
  const build = (over: Partial<BoardSession> & { id: number }) => toSessionView(session(over), TODAY)

  it('抓出過去沒點完的場次，最近的排前面', () => {
    const views = [
      build({ id: 1, session_date: '2026-09-10', recorded_count: 0 }),
      build({ id: 2, session_date: '2026-09-08', recorded_count: 5 }),
      build({ id: 3, session_date: '2026-09-09', recorded_count: 16 }),
    ]

    expect(findOverdue(views, TODAY).map((s) => s.id)).toEqual([1, 2])
  })

  it('今天與未來的場次不算漏點名', () => {
    const views = [
      build({ id: 1, session_date: TODAY, recorded_count: 0 }),
      build({ id: 2, session_date: '2026-09-18', recorded_count: 0 }),
    ]

    expect(findOverdue(views, TODAY)).toEqual([])
  })

  it('只回看 14 天', () => {
    const views = [
      build({ id: 1, session_date: '2026-09-02', recorded_count: 0 }),
      build({ id: 2, session_date: '2026-08-20', recorded_count: 0 }),
    ]

    expect(findOverdue(views, TODAY).map((s) => s.id)).toEqual([1])
  })

  it('回看天數剛好落在邊界那天要算進來', () => {
    const views = [build({ id: 1, session_date: '2026-09-02', recorded_count: 0 })]
    expect(findOverdue(views, TODAY, 14).map((s) => s.id)).toEqual([1])
    expect(findOverdue(views, TODAY, 13)).toEqual([])
  })
})

describe('courseOptions', () => {
  it('去重且依課名排序', () => {
    const list = [
      session({ id: 1, course_id: 4, course_name: '跆拳道' }),
      session({ id: 2, course_id: 1, course_name: '幼兒創意美術' }),
      session({ id: 3, course_id: 4, course_name: '跆拳道' }),
    ]

    expect(courseOptions(list)).toEqual([
      { id: 1, name: '幼兒創意美術' },
      { id: 4, name: '跆拳道' },
    ])
  })
})

describe('todaySummary', () => {
  const build = (over: Partial<BoardSession> & { id: number }) => toSessionView(session(over), TODAY)

  it('沒課時直說', () => {
    expect(todaySummary([])).toBe('今天沒有才藝課')
  })

  it('都點完了', () => {
    expect(todaySummary([build({ id: 1, recorded_count: 16 })])).toBe('今天 1 堂，都點完了')
  })

  it('還有沒點完的', () => {
    expect(
      todaySummary([build({ id: 1, recorded_count: 16 }), build({ id: 2, recorded_count: 0 })]),
    ).toBe('今天 2 堂，1 堂還沒點完')
  })
})

describe('todayInTaipei', () => {
  it('用台北時區判定今天，不跟著瀏覽器時區跑', () => {
    // UTC 2026-09-16 17:00 = 台北 2026-09-17 01:00
    expect(todayInTaipei(new Date('2026-09-16T17:00:00Z'))).toBe('2026-09-17')
    // UTC 2026-09-16 15:59 = 台北 2026-09-16 23:59
    expect(todayInTaipei(new Date('2026-09-16T15:59:00Z'))).toBe('2026-09-16')
  })
})
