import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setUserInfo, clearAuth } from '@/utils/auth'

import {
  CLASS_FEATURES,
  visibleClassFeatures,
  featureBadge,
} from '@/constants/portalClassFeatures'

describe('portalClassFeatures', () => {
  beforeEach(() => {
    // hasPortalPermission 內部直接呼叫同模組作用域的 getUserInfo()（ESM 同模組內部呼叫
    // 不經 export binding），所以不能用 vi.mock('@/utils/auth', ...) 覆寫 getUserInfo 去
    // 影響它——覆寫的只有 export binding，hasPortalPermission 內部呼叫到的仍是真實的
    // getUserInfo()。要測到真實的 hasPortalPermission（含 teacher 不短路、scope 後綴比對），
    // 必須走既有慣例：用 setUserInfo() 寫入真實的模組內部狀態
    // （見 src/utils/__tests__/portalPermission.test.ts）。
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('teacher 角色不被短路：持有 STUDENTS_READ:own_class 就看得到班級學生', () => {
    setUserInfo({
      role: 'teacher',
      permission_names: ['STUDENTS_READ:own_class'],
    })
    const keys = visibleClassFeatures('teach').map((f) => f.key)
    expect(keys).toContain('students')
  })

  it('沒有 BUS_TRIPS_OPERATE 就不顯示娃娃車格', () => {
    setUserInfo({
      role: 'teacher',
      permission_names: ['STUDENTS_READ'],
    })
    const keys = visibleClassFeatures('manage').map((f) => f.key)
    expect(keys).not.toContain('bus-trip')
  })

  it('持有 BUS_TRIPS_OPERATE 才顯示娃娃車格', () => {
    setUserInfo({
      role: 'teacher',
      permission_names: ['STUDENTS_READ', 'BUS_TRIPS_OPERATE'],
    })
    const keys = visibleClassFeatures('manage').map((f) => f.key)
    expect(keys).toContain('bus-trip')
  })

  it('無任何權限時兩組皆空', () => {
    setUserInfo({ role: 'teacher', permission_names: [] })
    expect(visibleClassFeatures('teach')).toHaveLength(0)
    expect(visibleClassFeatures('manage')).toHaveLength(0)
  })

  it('badge 對應正確的 counts 欄位', () => {
    const counts = {
      attendance_pending: 3,
      contact_books_pending: 1,
      observations_pending: 2,
      medications_pending: 4,
      incidents_today: 7,
    }
    const byKey = (k: string) => CLASS_FEATURES.find((f) => f.key === k)!
    expect(featureBadge(byKey('student-attendance'), counts)).toBe(3)
    expect(featureBadge(byKey('contact-book'), counts)).toBe(1)
    expect(featureBadge(byKey('observations'), counts)).toBe(2)
    expect(featureBadge(byKey('medications'), counts)).toBe(4)
  })

  it('incidents_today 不得產生 badge（是「今日已登記」不是待辦）', () => {
    const byKey = (k: string) => CLASS_FEATURES.find((f) => f.key === k)!
    expect(byKey('incidents').badgeKey).toBeUndefined()
    expect(featureBadge(byKey('incidents'), { incidents_today: 7 })).toBe(0)
  })

  it('counts 為 null 時 badge 一律 0，不得丟例外', () => {
    const byKey = (k: string) => CLASS_FEATURES.find((f) => f.key === k)!
    expect(featureBadge(byKey('student-attendance'), null)).toBe(0)
    expect(featureBadge(byKey('student-attendance'), undefined)).toBe(0)
  })

  it('量體位格沒有路由、改走 action', () => {
    const m = CLASS_FEATURES.find((f) => f.key === 'measurement')!
    expect(m.to).toBeUndefined()
    expect(m.action).toBe('measurement')
  })

  it('每個 key 唯一，且每格都有 to 或 action 其中之一', () => {
    const keys = CLASS_FEATURES.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const f of CLASS_FEATURES) {
      expect(Boolean(f.to) !== Boolean(f.action)).toBe(true)
    }
  })
})
