import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  hasPermission,
  hasWritePermission,
  canAccessRoute,
  getAllowedRoutes,
  setUserInfo,
  clearAuth,
  PERMISSION_VALUES,
} from '@/utils/auth'

describe('權限位元邏輯（BigInt 正確性）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('hasPermission', () => {
    it('未登入時一律回傳 false', () => {
      expect(hasPermission('EMPLOYEES_READ')).toBe(false)
    })

    it('teacher 角色對任何管理端權限都回傳 false', () => {
      setUserInfo({ role: 'teacher', permissions: -1 })
      expect(hasPermission('EMPLOYEES_READ')).toBe(false)
      expect(hasPermission('SALARY_WRITE')).toBe(false)
    })

    it('admin + permissions=-1 時一律回傳 true（super admin）', () => {
      setUserInfo({ role: 'admin', permissions: -1 })
      expect(hasPermission('EMPLOYEES_READ')).toBe(true)
      expect(hasPermission('SALARY_WRITE')).toBe(true)
      expect(hasPermission('RECRUITMENT_WRITE')).toBe(true)
    })

    it('permissions 為 null / undefined 時視為全權限', () => {
      setUserInfo({ role: 'admin', permissions: null })
      expect(hasPermission('EMPLOYEES_READ')).toBe(true)

      setUserInfo({ role: 'admin', permissions: undefined })
      expect(hasPermission('EMPLOYEES_READ')).toBe(true)
    })

    it('單一低位權限（EMPLOYEES_READ = 1<<8）能正確辨識', () => {
      setUserInfo({
        role: 'admin',
        permissions: PERMISSION_VALUES.EMPLOYEES_READ,
      })
      expect(hasPermission('EMPLOYEES_READ')).toBe(true)
      expect(hasPermission('EMPLOYEES_WRITE')).toBe(false)
      expect(hasPermission('SALARY_READ')).toBe(false)
    })

    it('組合低位權限用 OR 合併可同時擁有多項', () => {
      const combined =
        PERMISSION_VALUES.EMPLOYEES_READ | PERMISSION_VALUES.SALARY_READ
      setUserInfo({ role: 'admin', permissions: combined })
      expect(hasPermission('EMPLOYEES_READ')).toBe(true)
      expect(hasPermission('SALARY_READ')).toBe(true)
      expect(hasPermission('EMPLOYEES_WRITE')).toBe(false)
    })

    it('高位權限（DISMISSAL_CALLS_READ = 2**29）能用 BigInt 正確辨識', () => {
      setUserInfo({
        role: 'admin',
        permissions: PERMISSION_VALUES.DISMISSAL_CALLS_READ,
      })
      expect(hasPermission('DISMISSAL_CALLS_READ')).toBe(true)
      expect(hasPermission('DISMISSAL_CALLS_WRITE')).toBe(false)
    })

    it('極高位權限（RECRUITMENT_WRITE = 2**34）在 32-bit 溢位情況下仍正確', () => {
      // 2**34 無法用 32-bit 整數表示，必須走 BigInt 路徑
      setUserInfo({
        role: 'admin',
        permissions: PERMISSION_VALUES.RECRUITMENT_WRITE,
      })
      expect(hasPermission('RECRUITMENT_WRITE')).toBe(true)
      expect(hasPermission('RECRUITMENT_READ')).toBe(false)
      expect(hasPermission('FEES_WRITE')).toBe(false)
    })

    it('低位與高位權限混合組合時兩邊皆可辨識', () => {
      const combined =
        PERMISSION_VALUES.EMPLOYEES_READ +
        PERMISSION_VALUES.RECRUITMENT_READ
      setUserInfo({ role: 'admin', permissions: combined })
      expect(hasPermission('EMPLOYEES_READ')).toBe(true)
      expect(hasPermission('RECRUITMENT_READ')).toBe(true)
      expect(hasPermission('EMPLOYEES_WRITE')).toBe(false)
    })

    it('未知權限名稱回傳 false 不拋錯', () => {
      setUserInfo({ role: 'admin', permissions: -1 })
      // super admin 對未知名稱會通過早期回傳 true 因 permissions === -1
      // 所以切成具體權限的 user 測試
      setUserInfo({ role: 'admin', permissions: PERMISSION_VALUES.EMPLOYEES_READ })
      expect(hasPermission('NOT_A_REAL_PERMISSION')).toBe(false)
    })
  })

  describe('hasWritePermission', () => {
    it('自動組合 _WRITE 後綴並檢查', () => {
      setUserInfo({
        role: 'admin',
        permissions: PERMISSION_VALUES.SALARY_WRITE,
      })
      expect(hasWritePermission('SALARY')).toBe(true)
      expect(hasWritePermission('EMPLOYEES')).toBe(false)
    })
  })

  describe('canAccessRoute', () => {
    it('teacher 只能訪問 /portal 開頭的路由', () => {
      setUserInfo({ role: 'teacher', permissions: 0 })
      expect(canAccessRoute('/portal')).toBe(true)
      expect(canAccessRoute('/portal/attendance')).toBe(true)
      expect(canAccessRoute('/employees')).toBe(false)
      expect(canAccessRoute('/')).toBe(false)
    })

    it('/overtime 特殊規則：OVERTIME_READ 或 MEETINGS 其一即可', () => {
      setUserInfo({
        role: 'admin',
        permissions: PERMISSION_VALUES.MEETINGS,
      })
      expect(canAccessRoute('/overtime')).toBe(true)

      setUserInfo({
        role: 'admin',
        permissions: PERMISSION_VALUES.OVERTIME_READ,
      })
      expect(canAccessRoute('/overtime')).toBe(true)

      setUserInfo({ role: 'admin', permissions: 0 })
      expect(canAccessRoute('/overtime')).toBe(false)
    })

    it('公開路由（/login、/change-password、/public/*）放行；未知路由預設拒絕', () => {
      // 改為 default-deny：登入相關頁面與 /public/ 才預設允許，
      // 其他未匹配 ROUTE_PERMISSION_RULES 的路由一律拒絕，避免隱性後門。
      setUserInfo({ role: 'admin', permissions: 0 })
      expect(canAccessRoute('/login')).toBe(true)
      expect(canAccessRoute('/change-password')).toBe(true)
      expect(canAccessRoute('/public/activity')).toBe(true)
      expect(canAccessRoute('/some-unknown-path')).toBe(false)
    })

    it('未登入時任何路由皆禁止', () => {
      expect(canAccessRoute('/')).toBe(false)
      expect(canAccessRoute('/portal')).toBe(false)
    })

    it('招生管理路由需要 RECRUITMENT_READ（高位元）', () => {
      setUserInfo({
        role: 'admin',
        permissions: PERMISSION_VALUES.RECRUITMENT_READ,
      })
      expect(canAccessRoute('/recruitment')).toBe(true)
      expect(canAccessRoute('/recruitment-ivykids')).toBe(true)
      expect(canAccessRoute('/employees')).toBe(false)
    })
  })

  describe('getAllowedRoutes', () => {
    it('teacher 取得 portal 路由完整清單', () => {
      setUserInfo({ role: 'teacher', permissions: 0 })
      const routes = getAllowedRoutes()
      expect(routes).toContain('/portal')
      expect(routes).toContain('/portal/attendance')
      expect(routes).toContain('/portal/leave')
      expect(routes).not.toContain('/employees')
    })

    it('super admin（permissions=-1）取得全部管理端路由', () => {
      setUserInfo({ role: 'admin', permissions: -1 })
      const routes = getAllowedRoutes()
      expect(routes).toContain('/')
      expect(routes).toContain('/employees')
      expect(routes).toContain('/recruitment')
      expect(routes).toContain('/overtime')
    })

    it('部分權限時只回傳對應路由', () => {
      setUserInfo({
        role: 'admin',
        permissions:
          PERMISSION_VALUES.EMPLOYEES_READ | PERMISSION_VALUES.SALARY_READ,
      })
      const routes = getAllowedRoutes()
      expect(routes).toContain('/employees')
      expect(routes).toContain('/salary')
      expect(routes).not.toContain('/recruitment')
      expect(routes).not.toContain('/overtime')
    })

    it('未登入時回傳空陣列', () => {
      const routes = getAllowedRoutes()
      expect(routes).toEqual([])
    })
  })
})
