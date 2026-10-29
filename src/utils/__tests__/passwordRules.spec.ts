/**
 * passwordRules 新增的即時規則評估（evaluatePasswordRules）。
 * 既有 PASSWORD_RULES / validatePasswordStrength 的行為見 tests/unit/utils/passwordRules.test.js。
 * 本檔重點：「即時清單全部打勾」與「送出時的強度驗證通過」必須是同一個判定，不能兩套標準。
 */
import { describe, it, expect } from 'vitest'
import {
  PASSWORD_RULES,
  PASSWORD_RULE_CHECKS,
  PASSWORD_SERVER_ONLY_HINT,
  evaluatePasswordRules,
  validatePasswordStrength,
} from '@/utils/passwordRules'

const passesValidator = (password: string) => {
  let error: Error | undefined
  validatePasswordStrength(null, password, (err) => {
    error = err
  })
  return error === undefined
}

describe('evaluatePasswordRules', () => {
  it('規則順序與文案和 PASSWORD_RULES 一致', () => {
    expect(evaluatePasswordRules('').map((r) => r.label)).toEqual(PASSWORD_RULES)
    expect(PASSWORD_RULE_CHECKS).toHaveLength(PASSWORD_RULES.length)
  })

  it('空字串：全部未符合', () => {
    expect(evaluatePasswordRules('').map((r) => r.ok)).toEqual([false, false, false, false])
  })

  it.each([
    ['Aa1', [false, true, true, true]],
    ['abcdefgh', [true, false, true, false]],
    ['ABCDEFGH', [true, true, false, false]],
    ['12345678', [true, false, false, true]],
    ['Abcdefg1', [true, true, true, true]],
  ])('%s → %j', (password, expected) => {
    expect(evaluatePasswordRules(password).map((r) => r.ok)).toEqual(expected)
  })

  it('剛好 8 個字元算符合長度，7 個不算', () => {
    expect(evaluatePasswordRules('A1bcdefg')[0].ok).toBe(true)
    expect(evaluatePasswordRules('A1bcdef')[0].ok).toBe(false)
  })

  it.each(['', 'Aa1', 'abcdefgh', 'ABCDEFGH', '12345678', 'Abcdefgh', 'Abcdefg1', 'A1bcdefg', 'Pass word1', '密碼Abcdef1'])(
    '「%s」：即時清單全過 ⇔ 送出驗證通過（同一標準）',
    (password) => {
      const allMet = evaluatePasswordRules(password).every((r) => r.ok)
      expect(allMet).toBe(passesValidator(password))
    },
  )
})

describe('PASSWORD_SERVER_ONLY_HINT', () => {
  it('只提醒後端才驗得出的規則（近期重複、外洩名單），不是前端擋關', () => {
    expect(PASSWORD_SERVER_ONLY_HINT).toMatch(/最近用過/)
    expect(PASSWORD_SERVER_ONLY_HINT).toMatch(/外洩/)
  })
})
