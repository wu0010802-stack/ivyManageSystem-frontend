import { describe, it, expect, beforeEach } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

// 規則形狀斷言 + canAccessRoute 實際行為（default-deny、最長匹配、exact 不外溢）
describe('系統設定路由拆分權限規則', () => {
  const rulesFor = (path: string) => ROUTE_PERMISSION_RULES.filter((r) => r.path === path)

  it('/settings/accounts 掛 USER_MANAGEMENT_READ（單條、非 prefix）', () => {
    const rules = rulesFor('/settings/accounts')
    expect(rules.map((r) => r.permission)).toEqual(['USER_MANAGEMENT_READ'])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('/settings/roles 掛 ROLES_MANAGE（單條、非 prefix）', () => {
    const rules = rulesFor('/settings/roles')
    expect(rules.map((r) => r.permission)).toEqual(['ROLES_MANAGE'])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('/settings 維持 SETTINGS_READ 且非 prefix（不可外溢到子路由）', () => {
    const rules = rulesFor('/settings')
    expect(rules.map((r) => r.permission)).toEqual(['SETTINGS_READ'])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })
})

describe('canAccessRoute 三路由獨立放行', () => {
  // hasPermission 內部呼叫模組自身 getUserInfo（ESM 內部綁定 mock 不到），
  // 比照 AdminSidebar.spec.ts 慣例：用真實 setUserInfo 灌狀態。
  beforeEach(() => setUserInfo(null))

  it('只有 USER_MANAGEMENT_READ：可進帳號頁，不可進一般設定/角色頁', () => {
    setUserInfo({ role: 'hr', permission_names: ['USER_MANAGEMENT_READ'] })
    expect(canAccessRoute('/settings/accounts')).toBe(true)
    expect(canAccessRoute('/settings')).toBe(false)
    expect(canAccessRoute('/settings/roles')).toBe(false)
  })

  it('只有 ROLES_MANAGE：可進角色頁，不可進帳號頁/一般設定', () => {
    setUserInfo({ role: 'hr', permission_names: ['ROLES_MANAGE'] })
    expect(canAccessRoute('/settings/roles')).toBe(true)
    expect(canAccessRoute('/settings/accounts')).toBe(false)
    expect(canAccessRoute('/settings')).toBe(false)
  })

  it('只有 SETTINGS_READ：可進一般設定，不可進帳號頁/角色頁', () => {
    setUserInfo({ role: 'supervisor', permission_names: ['SETTINGS_READ'] })
    expect(canAccessRoute('/settings')).toBe(true)
    expect(canAccessRoute('/settings/accounts')).toBe(false)
    expect(canAccessRoute('/settings/roles')).toBe(false)
  })

  it('wildcard：三頁全可進', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    expect(canAccessRoute('/settings')).toBe(true)
    expect(canAccessRoute('/settings/accounts')).toBe(true)
    expect(canAccessRoute('/settings/roles')).toBe(true)
  })
})
