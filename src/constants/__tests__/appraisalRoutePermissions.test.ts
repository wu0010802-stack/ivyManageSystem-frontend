import { describe, it, expect, beforeEach } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

// SYNC-2：考核 nav gate 原本只掛 SETTINGS_READ，但後端 appraisal router 用
// APPRAISAL_READ。只持 APPRAISAL_READ（無 SETTINGS_READ）的考核專員會被
// canAccessRoute 的 default-deny 擋在 /appraisal 頁外。nav gate 須接受 APPRAISAL_READ。
describe('考核路由權限規則（APPRAISAL_READ 不被鎖死, SYNC-2）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('ROUTE_PERMISSION_RULES 有 /appraisal 接受 APPRAISAL_READ（prefix）', () => {
    expect(
      ROUTE_PERMISSION_RULES.some(
        (r) => r.path === '/appraisal' && r.permission === 'APPRAISAL_READ' && r.prefix === true,
      ),
    ).toBe(true)
  })

  it('只持 APPRAISAL_READ（無 SETTINGS_READ）的考核專員可進 /appraisal 及子頁', () => {
    setUserInfo({ role: 'supervisor', permission_names: ['APPRAISAL_READ'] })
    expect(canAccessRoute('/appraisal')).toBe(true)
    expect(canAccessRoute('/appraisal/cycles')).toBe(true)
  })

  it('既有持 SETTINGS_READ 使用者仍可進 /appraisal（OR 不回退）', () => {
    setUserInfo({ role: 'admin', permission_names: ['SETTINGS_READ'] })
    expect(canAccessRoute('/appraisal')).toBe(true)
  })
})
