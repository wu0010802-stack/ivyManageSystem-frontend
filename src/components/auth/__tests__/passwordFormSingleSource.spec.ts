/**
 * 後台改密碼「單一事實來源」守衛：強制改密頁與個人資料頁都必須用 PasswordChangeForm，
 * 不得再自帶一份 changePassword 呼叫／規則／驗證（2026-10-29 前兩處行為與提示不一致）。
 *
 * 範圍僅後台兩頁；教師端 PortalChangePasswordView 是另一個入口，不在此守衛內。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf-8')

const ADMIN_VIEWS = ['views/ChangePasswordView.vue', 'views/AdminProfileView.vue']

describe('後台改密碼表單單一來源', () => {
  it.each(ADMIN_VIEWS)('%s 使用共用 PasswordChangeForm', (file) => {
    const src = read(file)
    expect(src).toMatch(/from '@\/components\/auth\/PasswordChangeForm\.vue'/)
    expect(src).toContain('<PasswordChangeForm')
  })

  it.each(ADMIN_VIEWS)('%s 不再自帶 changePassword 呼叫或密碼強度驗證', (file) => {
    const src = read(file)
    expect(src).not.toMatch(/\bchangePassword\b/)
    expect(src).not.toMatch(/validatePasswordStrength/)
    expect(src).not.toMatch(/PASSWORD_RULES/)
  })

  it('共用元件本身才是唯一呼叫 changePassword 並套用 passwordRules 的地方', () => {
    const src = read('components/auth/PasswordChangeForm.vue')
    expect(src).toMatch(/changePassword\(/)
    expect(src).toMatch(/evaluatePasswordRules/)
    expect(src).toMatch(/validatePasswordStrength/)
  })
})
