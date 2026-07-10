import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setUserInfo, clearAuth, canAccessRoute } from '@/utils/auth'

describe('canAccessRoute /appraisal-year-end (整合工作區)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it.each(['SETTINGS_READ', 'SALARY_READ', 'YEAR_END_READ', 'APPRAISAL_FINALIZE', 'APPRAISAL_READ'])(
    '持有 %s 即可存取',
    (perm) => {
      setUserInfo({ role: 'admin', permission_names: [perm] })
      expect(canAccessRoute('/appraisal-year-end')).toBe(true)
    },
  )

  it('五者皆無則拒絕', () => {
    setUserInfo({ role: 'admin', permission_names: ['DASHBOARD'] })
    expect(canAccessRoute('/appraisal-year-end')).toBe(false)
  })
})

// 2026-07-10 巢狀路由：子區塊以「最長匹配」細分權限，對齊各子頁實際呼叫的後端守衛
// （Task 4 審查裁決 #1）。
describe('canAccessRoute /appraisal-year-end 子區塊細分權限（巢狀路由）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
  })

  it('持 APPRAISAL_READ 可過 /appraisal-year-end/appraisal/current', () => {
    setUserInfo({ role: 'admin', permission_names: ['APPRAISAL_READ'] })
    expect(canAccessRoute('/appraisal-year-end/appraisal/current')).toBe(true)
  })

  it('只持 YEAR_END_READ 不可過 /appraisal-year-end/year-end/payout（APPRAISAL_FINALIZE 才可）', () => {
    setUserInfo({ role: 'admin', permission_names: ['YEAR_END_READ'] })
    expect(canAccessRoute('/appraisal-year-end/year-end/payout')).toBe(false)

    setUserInfo({ role: 'admin', permission_names: ['APPRAISAL_FINALIZE'] })
    expect(canAccessRoute('/appraisal-year-end/year-end/payout')).toBe(true)
  })

  it('只持 SETTINGS_READ 可過 /appraisal-year-end/rules/year-end-rules', () => {
    setUserInfo({ role: 'admin', permission_names: ['SETTINGS_READ'] })
    expect(canAccessRoute('/appraisal-year-end/rules/year-end-rules')).toBe(true)
  })

  it('只持 SETTINGS_READ（無 APPRAISAL_READ）不可過規則設定四個子頁（走 appraisal API）', () => {
    setUserInfo({ role: 'admin', permission_names: ['SETTINGS_READ'] })
    expect(canAccessRoute('/appraisal-year-end/rules/scoring')).toBe(false)
    expect(canAccessRoute('/appraisal-year-end/rules/bonus-rates')).toBe(false)
    expect(canAccessRoute('/appraisal-year-end/rules/catalog')).toBe(false)
    expect(canAccessRoute('/appraisal-year-end/rules/enrollment-targets')).toBe(false)
  })
})
