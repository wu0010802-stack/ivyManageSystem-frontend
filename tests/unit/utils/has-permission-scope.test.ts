import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setUserInfo, hasPermission, clearAuth } from '@/utils/auth'

// RA-HIGH-1c：後端 has_permission 只對 13 個 scope-aware code 認 ":scope" 後綴，
// 其餘 code 帶 scope 後綴一律 fail-closed。前端 hasPermission 需對齊，
// 否則「UI 顯示有權、後端 403」反向漂移。
describe('hasPermission scope fail-closed (RA-HIGH-1c)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('non-scope-aware code with :own_class is NOT held (fail-closed)', () => {
    setUserInfo({ role: 'admin', permission_names: ['SALARY_READ:own_class'] })
    expect(hasPermission('SALARY_READ')).toBe(false)
  })

  it('another non-scope-aware code with :all is NOT held', () => {
    setUserInfo({ role: 'admin', permission_names: ['USER_MANAGEMENT_WRITE:all'] })
    expect(hasPermission('USER_MANAGEMENT_WRITE')).toBe(false)
  })

  it('scope-aware code with :own_class IS held (端點再做 row 過濾)', () => {
    setUserInfo({ role: 'admin', permission_names: ['STUDENTS_READ:own_class'] })
    expect(hasPermission('STUDENTS_READ')).toBe(true)
  })

  it('scope-aware code with :all IS held', () => {
    setUserInfo({ role: 'admin', permission_names: ['DISMISSAL_CALLS_WRITE:all'] })
    expect(hasPermission('DISMISSAL_CALLS_WRITE')).toBe(true)
  })

  it('bare code、wildcard、null 行為不變', () => {
    setUserInfo({ role: 'admin', permission_names: ['SALARY_READ'] })
    expect(hasPermission('SALARY_READ')).toBe(true)

    setUserInfo({ role: 'admin', permission_names: ['*'] })
    expect(hasPermission('SALARY_READ')).toBe(true)

    setUserInfo({ role: 'admin', permission_names: null })
    expect(hasPermission('SALARY_READ')).toBe(false)
  })
})
