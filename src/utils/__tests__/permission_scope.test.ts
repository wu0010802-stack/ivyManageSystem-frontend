// src/utils/__tests__/permission_scope.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setUserInfo, clearAuth, hasPermission } from '@/utils/auth'
import { getPermissionScope } from '@/utils/auth'

describe('getPermissionScope', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('returns "all" for wildcard user', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    expect(getPermissionScope('STUDENTS_READ')).toBe('all')
  })

  it('returns "all" for bare code (backward compat)', () => {
    setUserInfo({ role: 'admin', permission_names: ['STUDENTS_READ'] })
    expect(getPermissionScope('STUDENTS_READ')).toBe('all')
  })

  it('returns "own_class" for scoped code', () => {
    setUserInfo({ role: 'admin', permission_names: ['STUDENTS_READ:own_class'] })
    expect(getPermissionScope('STUDENTS_READ')).toBe('own_class')
  })

  it('returns null when permission not held', () => {
    setUserInfo({ role: 'admin', permission_names: ['DASHBOARD'] })
    expect(getPermissionScope('STUDENTS_READ')).toBeNull()
  })

  it('returns broader scope when user holds both bare and scoped', () => {
    setUserInfo({
      role: 'admin',
      permission_names: ['STUDENTS_READ', 'STUDENTS_READ:own_class'],
    })
    expect(getPermissionScope('STUDENTS_READ')).toBe('all')
  })

  it('returns null for only-invalid scope (fail-closed)', () => {
    setUserInfo({ role: 'admin', permission_names: ['STUDENTS_READ:owncampus'] })
    expect(getPermissionScope('STUDENTS_READ')).toBeNull()
  })

  it('returns null for multi-colon token (對齊後端 resolve_grant split fail-closed)', () => {
    // 後端 resolve_grant 用 split(":",1) → scope='own_class:extra'（不在 {own_class,all}）
    // 視為無效 → None。前端原用 split(":",2)[1] 會抽出合法 'own_class' → 較寬鬆（提權方向）。
    setUserInfo({
      role: 'admin',
      permission_names: ['STUDENTS_READ:own_class:extra'],
    })
    expect(getPermissionScope('STUDENTS_READ')).toBeNull()
  })

  it('returns null for portal_only-flagged account (與 hasPermission 短路對齊)', () => {
    // 帳號 role 字面非 'teacher'，但 flags 含 portal_only（自訂 portal_only 角色）。
    // hasPermission 正確回 false；getPermissionScope 亦應回 null，勿分歧（否則以其驅動
    // row-level scope 的消費者會把 portal_only 帳號誤判為有權）。
    setUserInfo({
      role: 'custom_portal',
      flags: ['portal_only'],
      permission_names: ['STUDENTS_READ:own_class'],
    })
    expect(hasPermission('STUDENTS_READ')).toBe(false)
    expect(getPermissionScope('STUDENTS_READ')).toBeNull()
  })
})

describe('hasPermission with scoped codes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('returns true for scoped grant', () => {
    setUserInfo({ role: 'admin', permission_names: ['STUDENTS_READ:own_class'] })
    expect(hasPermission('STUDENTS_READ')).toBe(true)
  })

  it('returns true for bare grant', () => {
    setUserInfo({ role: 'admin', permission_names: ['STUDENTS_READ'] })
    expect(hasPermission('STUDENTS_READ')).toBe(true)
  })

  it('returns true for wildcard', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    expect(hasPermission('STUDENTS_READ')).toBe(true)
  })

  it('returns false when not held in any form', () => {
    setUserInfo({ role: 'admin', permission_names: ['DASHBOARD'] })
    expect(hasPermission('STUDENTS_READ')).toBe(false)
  })
})
