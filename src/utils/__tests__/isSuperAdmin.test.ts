import { describe, it, expect, beforeEach } from 'vitest'
import { isSuperAdmin, setUserInfo } from '@/utils/auth'

// 同模組內部呼叫 getUserInfo，mock 不到——用真實 setUserInfo 灌狀態（AdminSidebar.spec 慣例）
describe('isSuperAdmin（flags 優先、admin 字面 fallback）', () => {
  beforeEach(() => setUserInfo(null))

  it('未登入 → false', () => {
    expect(isSuperAdmin()).toBe(false)
  })

  it('flags 含 super_admin 的自訂角色 → true', () => {
    setUserInfo({ role: 'custom_boss', permission_names: ['*'], flags: ['super_admin'] })
    expect(isSuperAdmin()).toBe(true)
  })

  it('flags 缺失（舊 localStorage userInfo）但 role=admin → true（fallback）', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    expect(isSuperAdmin()).toBe(true)
  })

  it('一般角色無 flag → false', () => {
    setUserInfo({ role: 'hr', permission_names: ['USER_MANAGEMENT_READ'], flags: [] })
    expect(isSuperAdmin()).toBe(false)
  })
})
