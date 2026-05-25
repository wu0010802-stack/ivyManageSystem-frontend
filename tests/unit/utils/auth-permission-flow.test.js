/**
 * 登入 → 權限 → 路由存取 整合流程測試（text[] 版本）
 *
 * 測試重點：
 *   1. 未登入（無 userInfo）時，所有管理端功能都被拒絕
 *   2. teacher 只能存取 portal 路由
 *   3. admin 依 permission_names 控制可存取的功能與路由
 *   4. getAllowedRoutes 根據角色與 permission_names 回傳正確清單
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setUserInfo,
  clearAuth,
  isLoggedIn,
  hasPermission,
  hasWritePermission,
  canAccessRoute,
  getAllowedRoutes,
} from '@/utils/auth'

describe('登入 → 權限 → 路由整合流程', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth()
    localStorage.clear()
    sessionStorage.clear()
  })

  // ── 未登入狀態 ─────────────────────────────────────────────────────────────

  describe('未登入（無 userInfo）', () => {
    it('isLoggedIn 回傳 false', () => {
      expect(isLoggedIn()).toBe(false)
    })

    it('hasPermission 回傳 false', () => {
      expect(hasPermission('SALARY_READ')).toBe(false)
      expect(hasPermission('LEAVES_READ')).toBe(false)
    })

    it('canAccessRoute 所有管理端路由均回傳 false', () => {
      expect(canAccessRoute('/leaves')).toBe(false)
      expect(canAccessRoute('/salary')).toBe(false)
      expect(canAccessRoute('/employees')).toBe(false)
      expect(canAccessRoute('/overtime')).toBe(false)
    })

    it('canAccessRoute 未登入時 /login 也回傳 false（Vue Router 守衛另外放行）', () => {
      expect(canAccessRoute('/login')).toBe(false)
    })

    it('getAllowedRoutes 回傳空陣列', () => {
      expect(getAllowedRoutes()).toEqual([])
    })
  })

  // ── teacher 角色 ────────────────────────────────────────────────────────────

  describe('teacher 角色', () => {
    beforeEach(() => {
      setUserInfo({
        id: 'T001',
        name: '陳老師',
        role: 'teacher',
        permission_names: [],
      })
    })

    it('isLoggedIn 回傳 true', () => {
      expect(isLoggedIn()).toBe(true)
    })

    it('hasPermission 任何管理端權限均回傳 false', () => {
      expect(hasPermission('LEAVES_READ')).toBe(false)
      expect(hasPermission('SALARY_READ')).toBe(false)
      expect(hasPermission('OVERTIME_READ')).toBe(false)
    })

    it('canAccessRoute 管理端路由回傳 false', () => {
      expect(canAccessRoute('/leaves')).toBe(false)
      expect(canAccessRoute('/salary')).toBe(false)
      expect(canAccessRoute('/overtime')).toBe(false)
    })

    it('canAccessRoute portal 路由回傳 true', () => {
      expect(canAccessRoute('/portal/leave')).toBe(true)
      expect(canAccessRoute('/portal/attendance')).toBe(true)
      expect(canAccessRoute('/portal/salary')).toBe(true)
    })

    it('getAllowedRoutes 只包含 portal 路由', () => {
      const routes = getAllowedRoutes()
      expect(routes.every(r => r.startsWith('/portal'))).toBe(true)
      expect(routes.length).toBeGreaterThan(0)
    })
  })

  // ── admin 角色 — 超級管理者（permission_names = ['*']）─────────────────────

  describe("admin — 超級管理者 (permission_names = ['*'])", () => {
    beforeEach(() => {
      setUserInfo({
        id: 'A001',
        name: '管理員',
        role: 'admin',
        permission_names: ['*'],
      })
    })

    it('hasPermission 任何權限均回傳 true', () => {
      expect(hasPermission('LEAVES_READ')).toBe(true)
      expect(hasPermission('SALARY_WRITE')).toBe(true)
      expect(hasPermission('ACTIVITY_WRITE')).toBe(true)
    })

    it('canAccessRoute 所有管理端路由均可存取', () => {
      expect(canAccessRoute('/leaves')).toBe(true)
      expect(canAccessRoute('/salary')).toBe(true)
      expect(canAccessRoute('/employees')).toBe(true)
      expect(canAccessRoute('/overtime')).toBe(true)
    })

    it('getAllowedRoutes 包含所有已定義的管理端路由', () => {
      const routes = getAllowedRoutes()
      expect(routes).toContain('/leaves')
      expect(routes).toContain('/salary')
      expect(routes).toContain('/employees')
      expect(routes).toContain('/overtime')
    })
  })

  // ── admin 角色 — 部分權限（list[str]）──────────────────────────────────────

  describe('admin — 部分權限（list[str]）', () => {
    it('僅有 LEAVES_READ 時可存取 /leaves，不可存取 /salary', () => {
      setUserInfo({
        id: 'A002',
        role: 'admin',
        permission_names: ['LEAVES_READ'],
      })

      expect(hasPermission('LEAVES_READ')).toBe(true)
      expect(hasPermission('SALARY_READ')).toBe(false)
      expect(canAccessRoute('/leaves')).toBe(true)
      expect(canAccessRoute('/salary')).toBe(false)
    })

    it('讀寫分離：有 LEAVES_READ 但無 LEAVES_WRITE 時，讀取可行，寫入不行', () => {
      setUserInfo({
        id: 'A003',
        role: 'admin',
        permission_names: ['LEAVES_READ'],
      })

      expect(hasPermission('LEAVES_READ')).toBe(true)
      expect(hasPermission('LEAVES_WRITE')).toBe(false)
      expect(hasWritePermission('LEAVES')).toBe(false)
    })

    it('同時擁有讀寫權限時兩者皆可', () => {
      setUserInfo({
        id: 'A004',
        role: 'admin',
        permission_names: ['LEAVES_READ', 'LEAVES_WRITE'],
      })

      expect(hasPermission('LEAVES_READ')).toBe(true)
      expect(hasWritePermission('LEAVES')).toBe(true)
    })

    it('有 OVERTIME_READ 或 MEETINGS 任一可存取 /overtime', () => {
      setUserInfo({
        id: 'A005',
        role: 'admin',
        permission_names: ['MEETINGS'],
      })

      expect(hasPermission('OVERTIME_READ')).toBe(false)
      expect(hasPermission('MEETINGS')).toBe(true)
      expect(canAccessRoute('/overtime')).toBe(true)
    })

    it('OVERTIME_READ 與 MEETINGS 均無時不可存取 /overtime', () => {
      setUserInfo({
        id: 'A006',
        role: 'admin',
        permission_names: ['LEAVES_READ'],
      })

      expect(canAccessRoute('/overtime')).toBe(false)
    })

    it('getAllowedRoutes 只回傳有對應權限的路由', () => {
      setUserInfo({
        id: 'A007',
        role: 'admin',
        permission_names: ['LEAVES_READ', 'EMPLOYEES_READ'],
      })

      const routes = getAllowedRoutes()
      expect(routes).toContain('/leaves')
      expect(routes).toContain('/employees')
      expect(routes).not.toContain('/salary')
      expect(routes).not.toContain('/classrooms')
    })
  })

  // ── 登出後 ─────────────────────────────────────────────────────────────────

  describe('clearAuth 後狀態', () => {
    it('登入後 clearAuth 可正確清除所有狀態', () => {
      setUserInfo({ id: 'A001', role: 'admin', permission_names: ['*'] })
      expect(isLoggedIn()).toBe(true)
      expect(hasPermission('SALARY_READ')).toBe(true)

      clearAuth()

      expect(isLoggedIn()).toBe(false)
      expect(hasPermission('SALARY_READ')).toBe(false)
      expect(canAccessRoute('/salary')).toBe(false)
      expect(getAllowedRoutes()).toEqual([])
    })
  })

  // ── permission_names 為 null（resolve 在後端） ─────────────────────────────

  describe('permission_names 為 null', () => {
    it('null 視為無顯式權限，hasPermission 回傳 false', () => {
      setUserInfo({ id: 'A008', role: 'admin', permission_names: null })
      expect(hasPermission('SALARY_READ')).toBe(false)
    })
  })

  // ── 無效或未知的 permissionName ────────────────────────────────────────────

  describe('無效或未知的 permissionName', () => {
    it("wildcard（permission_names=['*']）時，未知名稱也回傳 true", () => {
      setUserInfo({ id: 'A010', role: 'admin', permission_names: ['*'] })
      expect(hasPermission('NONEXISTENT_PERMISSION')).toBe(true)
    })

    it('部分 permissions 時，未知名稱回傳 false', () => {
      setUserInfo({
        id: 'A011',
        role: 'admin',
        permission_names: ['LEAVES_READ'],
      })
      expect(hasPermission('NONEXISTENT_PERMISSION')).toBe(false)
    })
  })
})
