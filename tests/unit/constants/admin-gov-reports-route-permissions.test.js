import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'
import {
  canAccessRoute,
  setUserInfo,
  clearAuth,
} from '@/utils/auth'

/**
 * 缺 ROUTE_PERMISSION_RULES 對 /admin/gov-reports/* 子路徑的後果：
 * - sidebar 顯示「月度月報」按鈕（v-if="canView.SALARY_READ"）
 * - 點下去 router.beforeEach 跑 canAccessRoute('/admin/gov-reports/monthly')
 * - 路由表沒這條 → default-deny → 回 false
 * - next 跳到第一個 allowedRoutes（通常 '/'）→ user 停在儀表板，sidebar 已高亮 monthly，
 *   user 誤以為「月度月報壞掉、數字怪」（其實看到的是儀表板的 0 學生 / 0 班級）
 */
describe('ROUTE_PERMISSION_RULES：/admin/gov-reports/* 子路徑', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('ROUTE_PERMISSION_RULES 必須有 /admin/gov-reports 規則（prefix）', () => {
    const rule = ROUTE_PERMISSION_RULES.find((r) => r.path === '/admin/gov-reports')
    expect(rule).toBeDefined()
    expect(rule.permission).toBe('GOV_REPORTS_VIEW')
    expect(rule.prefix).toBe(true)
  })

  it('有 GOV_REPORTS_VIEW 的 admin 可進 4 條 admin/gov-reports 子路徑', () => {
    setUserInfo({
      role: 'admin',
      permission_names: ['GOV_REPORTS_VIEW'],
    })
    expect(canAccessRoute('/admin/gov-reports/monthly')).toBe(true)
    expect(canAccessRoute('/admin/gov-reports/certificates')).toBe(true)
    expect(canAccessRoute('/admin/gov-reports/subsidies')).toBe(true)
    expect(canAccessRoute('/admin/gov-reports/iep')).toBe(true)
  })

  it('全權限 admin（wildcard *）可進 /admin/gov-reports/monthly', () => {
    setUserInfo({
      role: 'admin',
      permission_names: ['*'],
    })
    expect(canAccessRoute('/admin/gov-reports/monthly')).toBe(true)
  })

  it('沒有 GOV_REPORTS_VIEW 的 admin 無法進 /admin/gov-reports/*', () => {
    setUserInfo({
      role: 'admin',
      permission_names: ['SALARY_READ'],
    })
    expect(canAccessRoute('/admin/gov-reports/monthly')).toBe(false)
  })
})

describe('ROUTE_PERMISSION_RULES：/gov-reports（政府申報匯出）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('權限對齊後端 api/gov_reports.py 的 GOV_REPORTS_EXPORT 守衛', () => {
    const rule = ROUTE_PERMISSION_RULES.find((r) => r.path === '/gov-reports')
    expect(rule).toBeDefined()
    expect(rule.permission).toBe('GOV_REPORTS_EXPORT')
  })

  it('有 GOV_REPORTS_EXPORT 可進；僅 SALARY_READ 或 REPORTS 不可進', () => {
    setUserInfo({ role: 'admin', permission_names: ['GOV_REPORTS_EXPORT'] })
    expect(canAccessRoute('/gov-reports')).toBe(true)

    setUserInfo({ role: 'admin', permission_names: ['SALARY_READ', 'REPORTS'] })
    expect(canAccessRoute('/gov-reports')).toBe(false)
  })
})
