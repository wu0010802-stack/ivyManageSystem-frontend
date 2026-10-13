import { describe, it, expect } from 'vitest'
import { attendanceRouteProps, isValidDateQuery, legacySettingsShiftsRedirect } from '../attendanceRouteProps'

describe('attendanceRouteProps（SPEC-027 §6.1）', () => {
  it('未帶 query：全部 undefined，由頁面套預設（班表核對、今天）', () => {
    expect(attendanceRouteProps({})).toEqual({ tab: undefined, date: undefined, emp: undefined, filter: undefined })
  })

  it('五個頁籤原樣帶入，未知值忽略', () => {
    for (const tab of ['grid', 'records', 'rotation', 'swaps', 'shifts']) {
      expect(attendanceRouteProps({ tab }).tab).toBe(tab)
    }
    expect(attendanceRouteProps({ tab: 'nope' }).tab).toBeUndefined()
  })

  it('舊連結 tab=reconcile＝班表核對＋只看有問題（覆蓋 filter）', () => {
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

describe('legacySettingsShiftsRedirect（班別設定自 /settings 搬進排班與出勤）', () => {
  it('/settings?tab=shifts → /attendance?tab=shifts（只帶 tab，不夾帶其他 query）', () => {
    expect(legacySettingsShiftsRedirect({ path: '/settings', query: { tab: 'shifts', view: 'x' } })).toEqual({
      path: '/attendance',
      query: { tab: 'shifts' },
    })
    expect(legacySettingsShiftsRedirect({ path: '/settings', query: { tab: ['shifts', 'line'] } })).toEqual({
      path: '/attendance',
      query: { tab: 'shifts' },
    })
  })

  it('其他設定頁籤與其他路徑不轉', () => {
    expect(legacySettingsShiftsRedirect({ path: '/settings', query: { tab: 'line' } })).toBeNull()
    expect(legacySettingsShiftsRedirect({ path: '/settings', query: {} })).toBeNull()
    expect(legacySettingsShiftsRedirect({ path: '/settings/accounts', query: { tab: 'shifts' } })).toBeNull()
    expect(legacySettingsShiftsRedirect({ path: '/attendance', query: { tab: 'shifts' } })).toBeNull()
  })
})
