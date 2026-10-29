import { describe, it, expect } from 'vitest'
import {
  attendancePageProps,
  attendanceRouteProps,
  isValidDateQuery,
  legacyAttendanceScheduleRedirect,
  legacySettingsShiftsRedirect,
  schedulePageProps,
} from '../attendanceRouteProps'

describe('attendanceRouteProps（SPEC-027 §6.1）', () => {
  it('未帶 query：全部 undefined，由頁面套預設（第一個看得到的頁籤、今天）', () => {
    expect(attendanceRouteProps({})).toEqual({ tab: undefined, sub: undefined, date: undefined, emp: undefined, filter: undefined, view: undefined })
  })

  it('兩個頁籤：grid（核對）原樣帶入；schedule（排班）沒帶 sub 就是週班表；未知值忽略', () => {
    expect(attendanceRouteProps({ tab: 'grid' })).toMatchObject({ tab: 'grid', sub: undefined })
    expect(attendanceRouteProps({ tab: 'schedule' })).toMatchObject({ tab: 'schedule', sub: 'week' })
    for (const sub of ['week', 'rotation', 'swaps', 'shifts']) {
      expect(attendanceRouteProps({ tab: 'schedule', sub })).toMatchObject({ tab: 'schedule', sub })
    }
    expect(attendanceRouteProps({ tab: 'schedule', sub: 'nope' }).sub).toBe('week')
    expect(attendanceRouteProps({ tab: 'nope' }).tab).toBeUndefined()
    // sub 只屬於排班頁籤
    expect(attendanceRouteProps({ tab: 'grid', sub: 'swaps' }).sub).toBeUndefined()
  })

  it('舊連結 tab=records（原出勤明細）＝核對頁籤的逐人檢視（覆蓋 view）', () => {
    expect(attendanceRouteProps({ tab: 'records' })).toMatchObject({ tab: 'grid', view: 'person', sub: undefined })
    expect(attendanceRouteProps({ tab: 'records', view: 'month' })).toMatchObject({ tab: 'grid', view: 'person' })
  })

  it('舊連結 tab=rotation／swaps／shifts＝排班頁籤的同名子頁籤（覆蓋 sub）', () => {
    for (const legacy of ['rotation', 'swaps', 'shifts']) {
      expect(attendanceRouteProps({ tab: legacy })).toMatchObject({ tab: 'schedule', sub: legacy })
      expect(attendanceRouteProps({ tab: legacy, sub: 'week' })).toMatchObject({ tab: 'schedule', sub: legacy })
    }
  })

  it('舊連結 tab=reconcile＝核對＋只看有問題（覆蓋 filter）', () => {
    expect(attendanceRouteProps({ tab: 'reconcile', filter: 'future' })).toMatchObject({ tab: 'grid', filter: 'issues' })
  })

  it('date 須為有效 YYYY-MM-DD；emp 須為正整數；陣列 query 取第一個', () => {
    expect(attendanceRouteProps({ date: '2026-09-14', emp: '12' })).toMatchObject({ date: '2026-09-14', emp: 12 })
    expect(attendanceRouteProps({ date: '2026-13-40', emp: '-3' })).toMatchObject({ date: undefined, emp: undefined })
    expect(attendanceRouteProps({ date: ['2026-09-15', '2026-09-16'], emp: 'abc' })).toMatchObject({ date: '2026-09-15', emp: undefined })
    expect(isValidDateQuery('2026-02-30')).toBe(true) // Date.parse 寬鬆；與原 router 驗證一致
    expect(isValidDateQuery(20260914)).toBe(false)
  })
})

describe('attendanceRouteProps view（核對頁籤的檢視：週／月／逐人）', () => {
  it('view：week／month／person 原樣帶入；沒帶是 undefined（頁面預設週），非法值退回週', () => {
    expect(attendanceRouteProps({ view: 'month' }).view).toBe('month')
    expect(attendanceRouteProps({ view: 'person' }).view).toBe('person')
    expect(attendanceRouteProps({ view: ['week', 'month'] }).view).toBe('week')
    expect(attendanceRouteProps({ view: 'year' }).view).toBe('week')
    expect(attendanceRouteProps({ tab: 'grid' }).view).toBeUndefined()
  })
})

describe('attendanceRouteProps filter（核對的列篩選）', () => {
  it('all／issues／patterns／future／leftover 原樣帶入；未知值與沒帶都是 undefined', () => {
    for (const filter of ['all', 'issues', 'patterns', 'future', 'leftover']) {
      expect(attendanceRouteProps({ filter }).filter).toBe(filter)
    }
    expect(attendanceRouteProps({ filter: 'nope' }).filter).toBeUndefined()
    expect(attendanceRouteProps({}).filter).toBeUndefined()
    expect(attendanceRouteProps({ filter: ['leftover', 'issues'] }).filter).toBe('leftover')
  })
})

describe('legacySettingsShiftsRedirect（班別設定自 /settings 搬進排班頁）', () => {
  it('/settings?tab=shifts → /schedule?sub=shifts（只帶 sub，不夾帶其他 query）', () => {
    expect(legacySettingsShiftsRedirect({ path: '/settings', query: { tab: 'shifts', view: 'x' } })).toEqual({
      path: '/schedule',
      query: { sub: 'shifts' },
    })
    expect(legacySettingsShiftsRedirect({ path: '/settings', query: { tab: ['shifts', 'line'] } })).toEqual({
      path: '/schedule',
      query: { sub: 'shifts' },
    })
  })

  it('其他設定頁籤與其他路徑不轉', () => {
    expect(legacySettingsShiftsRedirect({ path: '/settings', query: { tab: 'line' } })).toBeNull()
    expect(legacySettingsShiftsRedirect({ path: '/settings', query: {} })).toBeNull()
    expect(legacySettingsShiftsRedirect({ path: '/settings/accounts', query: { tab: 'shifts' } })).toBeNull()
    expect(legacySettingsShiftsRedirect({ path: '/attendance', query: { tab: 'shifts' } })).toBeNull()
  })
})

describe('legacyAttendanceScheduleRedirect（排班自 /attendance 獨立成 /schedule，2026-10-29 S3）', () => {
  it('tab=schedule 與舊值 rotation／swaps／shifts → /schedule，保留子頁籤（週班表是預設不寫）與合法 date', () => {
    expect(legacyAttendanceScheduleRedirect({ path: '/attendance', query: { tab: 'schedule' } })).toEqual({ path: '/schedule', query: {} })
    expect(legacyAttendanceScheduleRedirect({ path: '/attendance', query: { tab: 'schedule', sub: 'swaps', date: '2026-09-14' } })).toEqual({
      path: '/schedule',
      query: { sub: 'swaps', date: '2026-09-14' },
    })
    for (const sub of ['rotation', 'swaps', 'shifts']) {
      expect(legacyAttendanceScheduleRedirect({ path: '/attendance', query: { tab: sub } })).toEqual({ path: '/schedule', query: { sub } })
    }
  })

  it('不合法的 date 丟掉；核對的 emp／filter／view 不夾帶', () => {
    expect(legacyAttendanceScheduleRedirect({ path: '/attendance', query: { tab: 'swaps', date: 'x', emp: '3', filter: 'issues', view: 'month' } })).toEqual({
      path: '/schedule',
      query: { sub: 'swaps' },
    })
  })

  it('核對的連結與其他路徑不轉（含 tab=records／reconcile 這兩個舊核對值）', () => {
    for (const tab of [undefined, 'grid', 'records', 'reconcile', 'nope']) {
      expect(legacyAttendanceScheduleRedirect({ path: '/attendance', query: tab ? { tab } : {} })).toBeNull()
    }
    expect(legacyAttendanceScheduleRedirect({ path: '/schedule', query: { tab: 'schedule' } })).toBeNull()
    expect(legacyAttendanceScheduleRedirect({ path: '/leaves', query: { tab: 'swaps' } })).toBeNull()
  })
})

describe('頁面 props：attendancePageProps／schedulePageProps', () => {
  it('attendancePageProps＝attendanceRouteProps＋scope=attendance', () => {
    expect(attendancePageProps({ tab: 'grid', view: 'person', emp: '7', date: '2026-09-14' })).toEqual({
      ...attendanceRouteProps({ tab: 'grid', view: 'person', emp: '7', date: '2026-09-14' }),
      scope: 'attendance',
    })
  })

  it('schedulePageProps：scope=schedule、tab 固定 schedule；sub 預設週班表，非法值退回週班表；date 須合法', () => {
    expect(schedulePageProps({})).toEqual({ scope: 'schedule', tab: 'schedule', sub: 'week', date: undefined })
    for (const sub of ['week', 'rotation', 'swaps', 'shifts']) {
      expect(schedulePageProps({ sub })).toMatchObject({ sub })
    }
    expect(schedulePageProps({ sub: 'nope' }).sub).toBe('week')
    expect(schedulePageProps({ date: '2026-09-14' }).date).toBe('2026-09-14')
    expect(schedulePageProps({ date: 'x' }).date).toBeUndefined()
    // 舊的 tab=rotation 直接帶到 /schedule 也認得（正常會先被守衛轉成 ?sub=）
    expect(schedulePageProps({ tab: 'rotation' }).sub).toBe('rotation')
  })
})
