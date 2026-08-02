import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  hasPermission,
  hasWritePermission,
  canAccessRoute,
  getAllowedRoutes,
  setUserInfo,
  clearAuth,
} from '@/utils/auth'

describe('權限邏輯（text[] 版本）', () => {
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

    it("teacher 角色對任何管理端權限都回傳 false（即便擁有 wildcard）", () => {
      setUserInfo({ role: 'teacher', permission_names: ['*'] })
      expect(hasPermission('EMPLOYEES_READ')).toBe(false)
      expect(hasPermission('SALARY_WRITE')).toBe(false)
    })

    it("admin + permission_names=['*'] 時一律回傳 true（super admin）", () => {
      setUserInfo({ role: 'admin', permission_names: ['*'] })
      expect(hasPermission('EMPLOYEES_READ')).toBe(true)
      expect(hasPermission('SALARY_WRITE')).toBe(true)
      expect(hasPermission('RECRUITMENT_WRITE')).toBe(true)
    })

    it('permission_names = null 時回傳 false（resolve 在後端，前端 null 視為無顯式權限）', () => {
      setUserInfo({ role: 'admin', permission_names: null })
      expect(hasPermission('EMPLOYEES_READ')).toBe(false)
    })

    it('permission_names = undefined 時回傳 false', () => {
      setUserInfo({ role: 'admin' })
      expect(hasPermission('EMPLOYEES_READ')).toBe(false)
    })

    it('單一權限 EMPLOYEES_READ 能正確辨識', () => {
      setUserInfo({ role: 'admin', permission_names: ['EMPLOYEES_READ'] })
      expect(hasPermission('EMPLOYEES_READ')).toBe(true)
      expect(hasPermission('EMPLOYEES_WRITE')).toBe(false)
      expect(hasPermission('SALARY_READ')).toBe(false)
    })

    it('組合權限可同時擁有多項', () => {
      setUserInfo({
        role: 'admin',
        permission_names: ['EMPLOYEES_READ', 'SALARY_READ'],
      })
      expect(hasPermission('EMPLOYEES_READ')).toBe(true)
      expect(hasPermission('SALARY_READ')).toBe(true)
      expect(hasPermission('EMPLOYEES_WRITE')).toBe(false)
    })

    it("過去高位權限（DISMISSAL_CALLS_READ / RECRUITMENT_WRITE）改成字串後不需 BigInt", () => {
      setUserInfo({
        role: 'admin',
        permission_names: ['DISMISSAL_CALLS_READ'],
      })
      expect(hasPermission('DISMISSAL_CALLS_READ')).toBe(true)
      expect(hasPermission('DISMISSAL_CALLS_WRITE')).toBe(false)

      setUserInfo({
        role: 'admin',
        permission_names: ['RECRUITMENT_WRITE'],
      })
      expect(hasPermission('RECRUITMENT_WRITE')).toBe(true)
      expect(hasPermission('RECRUITMENT_READ')).toBe(false)
      expect(hasPermission('FEES_WRITE')).toBe(false)
    })

    it('未知權限名稱回傳 false 不拋錯', () => {
      setUserInfo({
        role: 'admin',
        permission_names: ['EMPLOYEES_READ'],
      })
      expect(hasPermission('NOT_A_REAL_PERMISSION')).toBe(false)
    })
  })

  describe('hasWritePermission', () => {
    it('自動組合 _WRITE 後綴並檢查', () => {
      setUserInfo({
        role: 'admin',
        permission_names: ['SALARY_WRITE'],
      })
      expect(hasWritePermission('SALARY')).toBe(true)
      expect(hasWritePermission('EMPLOYEES')).toBe(false)
    })
  })

  describe('canAccessRoute', () => {
    it('teacher 只能訪問 /portal 開頭的路由', () => {
      setUserInfo({ role: 'teacher', permission_names: [] })
      expect(canAccessRoute('/portal')).toBe(true)
      expect(canAccessRoute('/portal/attendance')).toBe(true)
      expect(canAccessRoute('/employees')).toBe(false)
      expect(canAccessRoute('/')).toBe(false)
    })

    it('/overtime 特殊規則：OVERTIME_READ 或 MEETINGS 其一即可', () => {
      setUserInfo({
        role: 'admin',
        permission_names: ['MEETINGS'],
      })
      expect(canAccessRoute('/overtime')).toBe(true)

      setUserInfo({
        role: 'admin',
        permission_names: ['OVERTIME_READ'],
      })
      expect(canAccessRoute('/overtime')).toBe(true)

      setUserInfo({ role: 'admin', permission_names: [] })
      expect(canAccessRoute('/overtime')).toBe(false)
    })

    it('公開路由（/login、/change-password、/public/*）放行；未知路由預設拒絕', () => {
      setUserInfo({ role: 'admin', permission_names: [] })
      expect(canAccessRoute('/login')).toBe(true)
      expect(canAccessRoute('/change-password')).toBe(true)
      expect(canAccessRoute('/public/activity')).toBe(true)
      expect(canAccessRoute('/some-unknown-path')).toBe(false)
    })

    it('未登入時任何路由皆禁止', () => {
      expect(canAccessRoute('/')).toBe(false)
      expect(canAccessRoute('/portal')).toBe(false)
    })

    it('招生管理路由需要 RECRUITMENT_READ', () => {
      setUserInfo({
        role: 'admin',
        permission_names: ['RECRUITMENT_READ'],
      })
      expect(canAccessRoute('/recruitment')).toBe(true)
      // /recruitment-ivykids 的設計（redirect vs 獨立路由規則）由 RecruitmentIvykidsTab.test
      // 把關，此處不重複斷言以免兩測試對該路由形成相反期望。
      expect(canAccessRoute('/employees')).toBe(false)
    })

    // 回歸：/workbench/* 與 /activity/audit/* 曾無 ROUTE_PERMISSION_RULES，
    // canAccessRoute default-deny 把所有人（含 super admin）擋在待簽核/高風險/POS 解鎖稽核頁外。
    it('工作台路由 /workbench 與 /workbench/approvals 需要 APPROVALS', () => {
      setUserInfo({ role: 'admin', permission_names: ['APPROVALS'] })
      expect(canAccessRoute('/workbench')).toBe(true)
      expect(canAccessRoute('/workbench/approvals')).toBe(true)
      // 僅有 APPROVALS 不得進高風險頁（精確 scope，避免過度授權）
      expect(canAccessRoute('/workbench/high-risk')).toBe(false)
    })

    it('工作台高風險頁 /workbench/high-risk 需要 AUDIT_LOGS', () => {
      setUserInfo({ role: 'admin', permission_names: ['AUDIT_LOGS'] })
      expect(canAccessRoute('/workbench/high-risk')).toBe(true)
      // 僅有 AUDIT_LOGS 不得進待簽核頁
      expect(canAccessRoute('/workbench/approvals')).toBe(false)
    })

    // 業主裁決（2026-06-13）：待審核佇列 route gate 對齊後端動作端點（只要 ACTIVITY_WRITE）。
    // 入口按鈕（ActivityRegistrationView）本來就看 canWrite，三方一致。
    it('待審核佇列 /activity/registrations/pending 需要 ACTIVITY_WRITE（對齊後端）', () => {
      setUserInfo({ role: 'admin', permission_names: ['ACTIVITY_WRITE'] })
      expect(canAccessRoute('/activity/registrations/pending')).toBe(true)
      // 僅 READ 不可進（佇列含手動匹配/拒絕/強行收件等 mutation 入口）
      setUserInfo({ role: 'admin', permission_names: ['ACTIVITY_READ'] })
      expect(canAccessRoute('/activity/registrations/pending')).toBe(false)
    })

    it('POS 解鎖稽核 /activity/audit/pos-unlock 需要 ACTIVITY_PAYMENT_APPROVE', () => {
      setUserInfo({ role: 'admin', permission_names: ['ACTIVITY_PAYMENT_APPROVE'] })
      expect(canAccessRoute('/activity/audit/pos-unlock')).toBe(true)
      setUserInfo({ role: 'admin', permission_names: ['ACTIVITY_READ'] })
      expect(canAccessRoute('/activity/audit/pos-unlock')).toBe(false)
    })

    it('super admin 可進工作台與 POS 解鎖稽核（回歸 default-deny 鎖死全員）', () => {
      setUserInfo({ role: 'admin', permission_names: ['*'] })
      expect(canAccessRoute('/workbench')).toBe(true)
      expect(canAccessRoute('/workbench/approvals')).toBe(true)
      expect(canAccessRoute('/workbench/high-risk')).toBe(true)
      expect(canAccessRoute('/activity/audit/pos-unlock')).toBe(true)
    })
  })

  describe('getAllowedRoutes', () => {
    it('teacher 取得 portal 路由完整清單', () => {
      setUserInfo({ role: 'teacher', permission_names: [] })
      const routes = getAllowedRoutes()
      expect(routes).toContain('/portal')
      expect(routes).toContain('/portal/attendance')
      expect(routes).toContain('/portal/leave')
      expect(routes).not.toContain('/employees')
    })

    it("super admin（permission_names=['*']）取得全部管理端路由", () => {
      setUserInfo({ role: 'admin', permission_names: ['*'] })
      const routes = getAllowedRoutes()
      expect(routes).toContain('/')
      expect(routes).toContain('/employees')
      expect(routes).toContain('/recruitment')
      expect(routes).toContain('/overtime')
    })

    it('部分權限時只回傳對應路由', () => {
      setUserInfo({
        role: 'admin',
        permission_names: ['EMPLOYEES_READ', 'SALARY_READ'],
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

  describe('跨版本 userInfo 嗅探', () => {
    it("舊版 schema（含 'permissions' 且無 'permission_names'）會在模組載入時被清除", async () => {
      // 模擬部署前的舊 userInfo
      sessionStorage.setItem(
        'userInfo',
        JSON.stringify({ id: 'A001', role: 'admin', permissions: -1 })
      )
      vi.resetModules()
      const fresh = await import('@/utils/auth')
      expect(fresh.getUserInfo()).toBeNull()
      expect(sessionStorage.getItem('userInfo')).toBeNull()
    })

    it('留在共用 localStorage 的 userInfo 一律丟棄（即使 schema 是新版）', async () => {
      // userInfo 改 per-tab 後，localStorage 的殘留無法證明與本分頁目前的共享
      // Cookie 是同一身分，且會把 PII 洩漏給其他分頁——一律清掉，改由受保護
      // route 用 Cookie refresh 重新驗證。
      localStorage.setItem(
        'userInfo',
        JSON.stringify({ id: 'A002', role: 'admin', permission_names: ['*'] })
      )
      vi.resetModules()
      const fresh = await import('@/utils/auth')
      expect(fresh.getUserInfo()).toBeNull()
      expect(localStorage.getItem('userInfo')).toBeNull()
      expect(sessionStorage.getItem('auth_session_validated_at')).toBeNull()
    })

    it('本分頁 sessionStorage 的新版 userInfo 保留', async () => {
      sessionStorage.setItem(
        'userInfo',
        JSON.stringify({ id: 'A003', role: 'admin', permission_names: ['*'] })
      )
      vi.resetModules()
      const fresh = await import('@/utils/auth')
      expect(fresh.getUserInfo()).toMatchObject({
        id: 'A003',
        role: 'admin',
        permission_names: ['*'],
      })
    })
  })
})
