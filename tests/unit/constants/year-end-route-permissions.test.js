import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  PERMISSION_VALUES,
  ROUTE_PERMISSION_RULES,
} from '@/constants/permissions'
import {
  hasPermission,
  canAccessRoute,
  setUserInfo,
  clearAuth,
} from '@/utils/auth'

/**
 * bug sweep 2026-05-16 P0-1a 回歸測試。
 *
 * 缺 YEAR_END_* key + ROUTE_PERMISSION_RULES 的後果：
 * - canAccessRoute('/year_end/cycles') default-deny → router beforeEach 把所有人導走
 * - 後端 5 條 year_end 守衛永遠不會被觸發
 */
describe('PERMISSION_VALUES 與 ROUTE_PERMISSION_RULES：YEAR_END_*', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('PERMISSION_VALUES 必須包含 YEAR_END_READ/WRITE/FINALIZE 三個 key', () => {
    expect(PERMISSION_VALUES.YEAR_END_READ).toBeDefined()
    expect(PERMISSION_VALUES.YEAR_END_WRITE).toBeDefined()
    expect(PERMISSION_VALUES.YEAR_END_FINALIZE).toBeDefined()
  })

  it('位元值對齊後端 utils/permissions.py：52 / 60 / 61', () => {
    expect(PERMISSION_VALUES.YEAR_END_READ).toBe(2 ** 52)
    expect(PERMISSION_VALUES.YEAR_END_WRITE).toBe(2 ** 60)
    expect(PERMISSION_VALUES.YEAR_END_FINALIZE).toBe(2 ** 61)
  })

  it('ROUTE_PERMISSION_RULES 必須有 /year_end 規則（prefix）', () => {
    const rule = ROUTE_PERMISSION_RULES.find((r) => r.path === '/year_end')
    expect(rule).toBeDefined()
    expect(rule.permission).toBe('YEAR_END_READ')
    expect(rule.prefix).toBe(true)
  })

  it('hasPermission(YEAR_END_READ) 用 BigInt 比對高位元正確', () => {
    setUserInfo({
      role: 'admin',
      permissions: PERMISSION_VALUES.YEAR_END_READ,
    })
    expect(hasPermission('YEAR_END_READ')).toBe(true)
    expect(hasPermission('YEAR_END_WRITE')).toBe(false)
    expect(hasPermission('YEAR_END_FINALIZE')).toBe(false)
  })

  it('canAccessRoute("/year_end/cycles") 在有 YEAR_END_READ 時回 true', () => {
    setUserInfo({
      role: 'admin',
      permissions: PERMISSION_VALUES.YEAR_END_READ,
    })
    expect(canAccessRoute('/year_end/cycles')).toBe(true)
    expect(canAccessRoute('/year_end/cycles/5')).toBe(true)
  })

  it('沒有 YEAR_END_READ 的 admin 無法進 /year_end/*', () => {
    setUserInfo({
      role: 'admin',
      permissions: PERMISSION_VALUES.SALARY_READ, // 別的權限
    })
    expect(canAccessRoute('/year_end/cycles')).toBe(false)
  })
})
