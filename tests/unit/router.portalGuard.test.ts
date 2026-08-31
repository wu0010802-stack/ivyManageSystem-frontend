import { describe, it, expect, beforeEach, vi } from 'vitest'

// refreshSession 不可真打網路：guard restoreSessionIfNeeded 可能呼叫。
// 我們讓使用者已 isLoggedIn（setUserInfo + session validated），就不會走 refresh 分支。
vi.mock('@/api/auth', () => ({
  refreshSession: vi.fn(() => Promise.reject(new Error('no-network'))),
}))

import router from '@/router'
import { setUserInfo, clearAuth } from '@/utils/auth'

function findRoute(path: string) {
  return router.getRoutes().find((r) => r.path === path)
}

const SENSITIVE_PORTAL_ROUTES: Array<[string, string]> = [
  ['/portal/class-hub', 'STUDENTS_READ'],
  ['/portal/students', 'STUDENTS_READ'],
  ['/portal/students/:studentId', 'STUDENTS_READ'],
  ['/portal/student-attendance', 'STUDENTS_READ'],
  ['/portal/medications', 'STUDENTS_HEALTH_READ'],
  ['/portal/observations', 'STUDENTS_READ'],
  ['/portal/incidents', 'STUDENTS_READ'],
  ['/portal/assessments', 'STUDENTS_READ'],
  ['/portal/contact-book', 'PORTFOLIO_READ'],
  ['/portal/dismissal-calls', 'DISMISSAL_CALLS_READ'],
]

describe('C52: portal 敏感子路由逐路由 meta.permission', () => {
  it.each(SENSITIVE_PORTAL_ROUTES)('%s 應掛 meta.permission=%s', (path, perm) => {
    const r = findRoute(path)
    expect(r, `route ${path} 不存在`).toBeDefined()
    expect(r?.meta?.permission).toBe(perm)
  })

  it('個人/通用 portal 子路由不應掛 permission（避免誤鎖全教師）', () => {
    for (const path of ['/portal/home', '/portal/salary', '/portal/profile', '/portal/growth']) {
      expect(findRoute(path)?.meta?.permission).toBeUndefined()
    }
  })
})

describe('C52: beforeEach 對缺權限身分導向 /portal/error 403 錯誤頁', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  async function navigate(to: string): Promise<string> {
    return new Promise((resolve) => {
      const guard = (router.options as unknown) // not used; drive via push
      void guard
      router.push(to).then(
        () => resolve(router.currentRoute.value.fullPath),
        () => resolve(router.currentRoute.value.fullPath)
      )
    })
  }

  it('教師缺 STUDENTS_HEALTH_READ 進 /portal/medications 被導向 /portal/error 並帶完整脈絡', async () => {
    // setUserInfo 同步寫 session validated → isLoggedIn 為 true，不走 refresh
    setUserInfo({
      role: 'teacher',
      permission_names: ['STUDENTS_READ:own_class'], // 無 health
    })
    await navigate('/portal/medications')
    expect(router.currentRoute.value.path).toBe('/portal/error')
    expect(router.currentRoute.value.query).toMatchObject({
      type: 'forbidden',
      feature: '用藥執行',
      permission: 'STUDENTS_HEALTH_READ',
      from: '/portal/medications',
    })
  })

  it('教師持有 STUDENTS_READ:own_class 可進 /portal/students', async () => {
    setUserInfo({
      role: 'teacher',
      permission_names: ['STUDENTS_READ:own_class'],
    })
    const landed = await navigate('/portal/students')
    expect(landed).toBe('/portal/students')
  })

  it('教師缺 DISMISSAL_CALLS_READ 進 /portal/dismissal-calls 被導向 /portal/error 並帶完整脈絡', async () => {
    setUserInfo({
      role: 'teacher',
      permission_names: ['STUDENTS_READ:own_class'],
    })
    await navigate('/portal/dismissal-calls')
    expect(router.currentRoute.value.path).toBe('/portal/error')
    expect(router.currentRoute.value.query).toMatchObject({
      type: 'forbidden',
      feature: '接送通知',
      permission: 'DISMISSAL_CALLS_READ',
      from: '/portal/dismissal-calls',
    })
  })
})
