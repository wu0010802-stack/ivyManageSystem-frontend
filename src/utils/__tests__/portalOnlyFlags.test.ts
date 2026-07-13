import { describe, it, expect, beforeEach } from 'vitest'
import { hasPermission, hasPortalPermission, isPortalOnlyUser, setUserInfo } from '@/utils/auth'

describe('isPortalOnlyUser（flags 優先、PORTAL_ONLY_ROLES fallback）', () => {
  it('flags 含 portal_only 的自訂角色 → true（即使 role 不在硬編碼清單）', () => {
    expect(isPortalOnlyUser({ role: 'custom_tutor', flags: ['portal_only'] })).toBe(true)
  })

  it('flags 缺失但 role=teacher / parent → true（fallback）', () => {
    expect(isPortalOnlyUser({ role: 'teacher' })).toBe(true)
    expect(isPortalOnlyUser({ role: 'parent' })).toBe(true)
  })

  it('一般管理端角色 → false；null → false', () => {
    expect(isPortalOnlyUser({ role: 'hr', flags: [] })).toBe(false)
    expect(isPortalOnlyUser(null)).toBe(false)
  })
})

describe('hasPermission portal_only 短路（OR、只嚴不鬆）', () => {
  beforeEach(() => setUserInfo(null))

  it('teacher（無 flags 舊資料）→ false（字面 fallback 仍在）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['*'] })
    expect(hasPermission('DASHBOARD')).toBe(false)
  })

  it('portal_only flag 的自訂角色 → false（即使持有權限）', () => {
    setUserInfo({ role: 'custom_tutor', permission_names: ['DASHBOARD'], flags: ['portal_only'] })
    expect(hasPermission('DASHBOARD')).toBe(false)
  })

  it('一般角色不受影響', () => {
    setUserInfo({ role: 'hr', permission_names: ['DASHBOARD'], flags: [] })
    expect(hasPermission('DASHBOARD')).toBe(true)
  })

  it('hasPortalPermission 不受短路影響（教師 Portal 專屬權限）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['PARENT_MESSAGES_WRITE'], flags: ['portal_only'] })
    expect(hasPortalPermission('PARENT_MESSAGES_WRITE')).toBe(true)
  })
})
