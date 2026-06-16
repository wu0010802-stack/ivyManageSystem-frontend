// src/utils/__tests__/portalPermission.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setUserInfo, clearAuth, hasPermission, hasPortalPermission } from '@/utils/auth'

describe('hasPortalPermission（teacher 不短路）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('teacher 持有 PARENT_MESSAGES_WRITE 時回 true（與後端 ROLE_TEMPLATES 對齊）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['PARENT_MESSAGES_WRITE'] })
    expect(hasPortalPermission('PARENT_MESSAGES_WRITE')).toBe(true)
  })

  it('一般 hasPermission 對 teacher 仍短路回 false（防教師取得 admin 權限）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['PARENT_MESSAGES_WRITE', 'EMPLOYEES_READ'] })
    expect(hasPermission('EMPLOYEES_READ')).toBe(false)
    expect(hasPermission('PARENT_MESSAGES_WRITE')).toBe(false)
  })

  it('teacher 未持有該權限時回 false', () => {
    setUserInfo({ role: 'teacher', permission_names: ['ATTENDANCE_WRITE'] })
    expect(hasPortalPermission('PARENT_MESSAGES_WRITE')).toBe(false)
  })

  it('wildcard "*" 回 true', () => {
    setUserInfo({ role: 'teacher', permission_names: ['*'] })
    expect(hasPortalPermission('PARENT_MESSAGES_WRITE')).toBe(true)
  })

  it('scope-aware code 帶 scope 後綴視為持有', () => {
    setUserInfo({ role: 'teacher', permission_names: ['STUDENTS_READ:own_class'] })
    expect(hasPortalPermission('STUDENTS_READ')).toBe(true)
  })

  it('非 scope-aware code 帶 scope 後綴 fail-closed（與後端 has_permission 對齊）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['PARENT_MESSAGES_WRITE:own_class'] })
    expect(hasPortalPermission('PARENT_MESSAGES_WRITE')).toBe(false)
  })

  it('permission_names 為 null 時回 false（resolve 在後端）', () => {
    setUserInfo({ role: 'teacher', permission_names: null })
    expect(hasPortalPermission('PARENT_MESSAGES_WRITE')).toBe(false)
  })

  it('未登入回 false', () => {
    clearAuth({ notifyServer: false })
    expect(hasPortalPermission('PARENT_MESSAGES_WRITE')).toBe(false)
  })

  it('admin 角色也能用此 helper（同 hasPermission 結果）', () => {
    setUserInfo({ role: 'admin', permission_names: ['PARENT_MESSAGES_WRITE'] })
    expect(hasPortalPermission('PARENT_MESSAGES_WRITE')).toBe(true)
  })
})
