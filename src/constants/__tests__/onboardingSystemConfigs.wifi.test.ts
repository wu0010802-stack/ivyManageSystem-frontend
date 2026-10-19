/**
 * 校內 WiFi 白名單說明文字守衛。
 *
 * 後端 `api/auth._is_school_wifi`：白名單為空＝全部放行（fail-open，刻意與
 * kiosk IP 白名單的 fail-closed 方向相反），且只限制 teacher 角色登入。
 * 說明文字曾誤寫成「未設定時 kiosk 打卡會全部擋下（fail-closed）」，會誤導
 * 行政以為留空比較安全。
 */
import { describe, it, expect } from 'vitest'
import { ALL_SYSTEM_CONFIG_FIELDS, SYSTEM_CONFIG_SECTIONS } from '../onboardingSystemConfigs'

const field = (key: string) => {
  const f = ALL_SYSTEM_CONFIG_FIELDS.find((x) => x.key === key)
  if (!f) throw new Error(`missing field ${key}`)
  return f
}

describe('auth.school_wifi_ips 說明與後端 fail-open 語意一致', () => {
  it('hint 不得宣稱 fail-closed，須說明留空＝不限制、只管教師登入', () => {
    const hint = field('auth.school_wifi_ips').hint ?? ''
    expect(hint).not.toContain('fail-closed')
    expect(hint).not.toContain('kiosk')
    expect(hint).toContain('不限制')
    expect(hint).toContain('教師')
  })

  it('kiosk.allowed_ips 仍標示 fail-closed', () => {
    expect(field('kiosk.allowed_ips').hint ?? '').toContain('fail-closed')
  })

  it('區塊說明不得把兩項一起說成未設定即全部擋下', () => {
    const section = SYSTEM_CONFIG_SECTIONS.find((s) => s.fields.some((f) => f.key === 'auth.school_wifi_ips'))
    expect(section?.hint ?? '').not.toContain('這兩項若未設定')
  })
})
