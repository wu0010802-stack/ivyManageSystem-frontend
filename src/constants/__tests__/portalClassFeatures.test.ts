import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setUserInfo, clearAuth } from '@/utils/auth'

import {
  CLASS_FEATURES,
  visibleClassFeatures,
  featureBadge,
  resolveFeatureBadge,
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

  // 首頁整併（/portal/class 併入 /portal/home）後，教學／管理兩組各混入一格
  // 不需權限的跨班級功能，「無權限即整組空」不再成立——但需要權限的那些格子
  // 仍必須一格都不剩，否則就是權限過濾破了。
  it('無班級權限時，teach／manage 只剩不需權限的那一格', () => {
    setUserInfo({ role: 'teacher', permission_names: [] })
    expect(visibleClassFeatures('teach').map((f) => f.key)).toEqual([
      'activity-attendance',
    ])
    expect(visibleClassFeatures('manage').map((f) => f.key)).toEqual(['surveys'])
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

  // ===== 首頁整併（/portal/class 併入 /portal/home）新增的「我的」組 =====

  it('「我的」組五格都不需權限，空權限帳號一樣看得到', () => {
    setUserInfo({ role: 'teacher', permission_names: [] })
    expect(visibleClassFeatures('mine').map((f) => f.key)).toEqual([
      'pending-substitute',
      'pending-swap',
      'anomalies',
      'announcements',
      'growth',
    ])
  })

  it('成長軌跡屬「我的」組：它是教師自己的考核歷程，不是學生的成長紀錄', () => {
    const f = CLASS_FEATURES.find((x) => x.key === 'growth')!
    expect(f.group).toBe('mine')
    expect(f.to).toBe('/portal/growth')
  })

  it('才藝點名指向 2026-09-14 拆出的獨立頁，不是舊的 ?tab=attendance', () => {
    const f = CLASS_FEATURES.find((x) => x.key === 'activity-attendance')!
    expect(f.to).toBe('/portal/activity/attendance')
  })

  it('「我的」組 badge 取自 dashboard actions，不是班級 hub counts', () => {
    const actions = {
      pending_substitute: 2,
      pending_swap: 1,
      pending_anomaly_confirms: 5,
      unread_announcements: 3,
    }
    const byKey = (k: string) => CLASS_FEATURES.find((f) => f.key === k)!
    expect(resolveFeatureBadge(byKey('pending-substitute'), { actions })).toBe(2)
    expect(resolveFeatureBadge(byKey('pending-swap'), { actions })).toBe(1)
    expect(resolveFeatureBadge(byKey('anomalies'), { actions })).toBe(5)
    expect(resolveFeatureBadge(byKey('announcements'), { actions })).toBe(3)
    // 成長軌跡沒有待辦語意，永遠不掛數字
    expect(resolveFeatureBadge(byKey('growth'), { actions })).toBe(0)
  })

  it('resolveFeatureBadge 併攏三種來源：hub counts／外部計數／dashboard actions', () => {
    const byKey = (k: string) => CLASS_FEATURES.find((f) => f.key === k)!
    const sources = {
      counts: { attendance_pending: 3 },
      actions: { unread_announcements: 6 },
      dismissal: 4,
      pickup: 2,
    }
    expect(resolveFeatureBadge(byKey('student-attendance'), sources)).toBe(3)
    expect(resolveFeatureBadge(byKey('dismissal-calls'), sources)).toBe(4)
    expect(resolveFeatureBadge(byKey('pickup-authorizations'), sources)).toBe(2)
    expect(resolveFeatureBadge(byKey('announcements'), sources)).toBe(6)
  })

  it('來源全缺時 resolveFeatureBadge 一律回 0，不得丟例外', () => {
    const byKey = (k: string) => CLASS_FEATURES.find((f) => f.key === k)!
    expect(resolveFeatureBadge(byKey('student-attendance'), {})).toBe(0)
    expect(resolveFeatureBadge(byKey('announcements'), {})).toBe(0)
    expect(resolveFeatureBadge(byKey('dismissal-calls'), {})).toBe(0)
  })
})
