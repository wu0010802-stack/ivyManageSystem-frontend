import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'
import {
  canAccessRoute,
  setUserInfo,
  clearAuth,
} from '@/utils/auth'

/**
 * 回歸（e2e CI 2026-06-05 抓到）：/admin/offboarding 漏列 ROUTE_PERMISSION_RULES
 * 的後果（與已修的 /workbench、/activity/audit/pos-unlock 同類）：
 * - 路由仍存在並渲染 OffboardingView（h2「離職管理」）
 * - 但 canAccessRoute('/admin/offboarding') → getRoutePermissions 回 []
 *   → default-deny → false → **連 wildcard `*` super-admin 都被導走**
 * - 結果：離職管理頁所有人都進不去（選單看得到、點了被踢）
 * 權限對齊後端 api/offboarding.py 讀取端點的 EMPLOYEES_READ 守衛。
 */
describe('ROUTE_PERMISSION_RULES：/admin/offboarding', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('ROUTE_PERMISSION_RULES 必須有 /admin/offboarding 規則', () => {
    const rule = ROUTE_PERMISSION_RULES.find((r) => r.path === '/admin/offboarding')
    expect(rule).toBeDefined()
    expect(rule.permission).toBe('EMPLOYEES_READ')
  })

  it('有 EMPLOYEES_READ 的 admin 可進 /admin/offboarding', () => {
    setUserInfo({ role: 'admin', permission_names: ['EMPLOYEES_READ'] })
    expect(canAccessRoute('/admin/offboarding')).toBe(true)
  })

  it('全權限 admin（wildcard *）可進 /admin/offboarding（修復 default-deny 鎖死）', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    expect(canAccessRoute('/admin/offboarding')).toBe(true)
  })

  it('沒有 EMPLOYEES_READ 的 admin 無法進 /admin/offboarding', () => {
    setUserInfo({ role: 'admin', permission_names: ['SALARY_READ'] })
    expect(canAccessRoute('/admin/offboarding')).toBe(false)
  })
})
