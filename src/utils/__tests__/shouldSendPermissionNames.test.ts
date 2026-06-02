import { describe, it, expect } from 'vitest'
import { shouldSendPermissionNames, ROLES_WITHOUT_PERMISSION_UI } from '@/utils/auth'

describe('shouldSendPermissionNames — 帳號 create/edit 共用權限送出判定', () => {
  // P0 回歸：teacher / parent 隱藏權限 UI，表單殘留的 wildcard 不可被當成自訂權限送出。
  it('teacher 一律省略 permission_names（即使表單殘留非預設值）', () => {
    // isUsingDefault=false 模擬表單停在 wildcard（非 teacher 模板）的越權情境
    expect(shouldSendPermissionNames('teacher', false)).toBe(false)
    expect(shouldSendPermissionNames('teacher', true)).toBe(false)
  })

  it('parent 同樣一律省略 permission_names（同類 latent 越權洞）', () => {
    expect(shouldSendPermissionNames('parent', false)).toBe(false)
    expect(shouldSendPermissionNames('parent', true)).toBe(false)
  })

  it('有權限 UI 的角色：偏離預設才送出', () => {
    expect(shouldSendPermissionNames('hr', false)).toBe(true) // 偏離 → 送出自訂
    expect(shouldSendPermissionNames('hr', true)).toBe(false) // 等同預設 → 省略
    expect(shouldSendPermissionNames('principal', false)).toBe(true)
    expect(shouldSendPermissionNames('accountant', true)).toBe(false)
  })

  it('admin 使用預設（wildcard）時省略，交由後端 resolve admin 角色', () => {
    expect(shouldSendPermissionNames('admin', true)).toBe(false)
  })

  it('ROLES_WITHOUT_PERMISSION_UI 與隱藏權限 UI 的角色一致', () => {
    expect(ROLES_WITHOUT_PERMISSION_UI).toContain('teacher')
    expect(ROLES_WITHOUT_PERMISSION_UI).toContain('parent')
  })
})
