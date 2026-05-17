import { describe, it, expect, vi } from 'vitest'
import { PASSWORD_RULES, validatePasswordStrength } from '@/utils/passwordRules'

describe('PASSWORD_RULES', () => {
  it('提供 4 條規則文案，且包含「8 個字元」「大寫」「小寫」「數字」關鍵字', () => {
    expect(PASSWORD_RULES).toHaveLength(4)
    expect(PASSWORD_RULES.join('|')).toMatch(/8 個字元/)
    expect(PASSWORD_RULES.join('|')).toMatch(/大寫/)
    expect(PASSWORD_RULES.join('|')).toMatch(/小寫/)
    expect(PASSWORD_RULES.join('|')).toMatch(/數字/)
  })
})

/**
 * validatePasswordStrength 是 Element Plus async-validator 風格的 (rule, value, callback) 函式
 * - callback() 不帶參數 → 通過
 * - callback(new Error(msg)) → 失敗
 */
describe('validatePasswordStrength()', () => {
  const run = (value) => {
    const cb = vi.fn()
    validatePasswordStrength(null, value, cb)
    return cb
  }

  it('空字串：callback 傳 Error "請輸入新密碼"', () => {
    const cb = run('')
    expect(cb).toHaveBeenCalledTimes(1)
    const err = cb.mock.calls[0][0]
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('請輸入新密碼')
  })

  it('null / undefined 也視為未輸入', () => {
    const cb1 = run(null)
    const cb2 = run(undefined)
    expect(cb1.mock.calls[0][0].message).toBe('請輸入新密碼')
    expect(cb2.mock.calls[0][0].message).toBe('請輸入新密碼')
  })

  it('長度 < 8：「密碼至少 8 個字元」', () => {
    const cb = run('Aa1')
    expect(cb.mock.calls[0][0].message).toBe('密碼至少 8 個字元')
  })

  it('缺大寫：「密碼需包含至少 1 個大寫英文字母」', () => {
    const cb = run('abcdefg1')
    expect(cb.mock.calls[0][0].message).toBe('密碼需包含至少 1 個大寫英文字母')
  })

  it('缺小寫：「密碼需包含至少 1 個小寫英文字母」', () => {
    const cb = run('ABCDEFG1')
    expect(cb.mock.calls[0][0].message).toBe('密碼需包含至少 1 個小寫英文字母')
  })

  it('缺數字：「密碼需包含至少 1 個數字」', () => {
    const cb = run('Abcdefgh')
    expect(cb.mock.calls[0][0].message).toBe('密碼需包含至少 1 個數字')
  })

  it('全通過：callback() 不帶參數', () => {
    const cb = run('Abcdefg1')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0]).toEqual([])
  })

  it('剛好 8 位數且含三類字符通過', () => {
    const cb = run('A1bcdefg')
    expect(cb.mock.calls[0]).toEqual([])
  })

  it('檢查順序：長度錯誤優先於缺字符類別', () => {
    // 'A1' 既不滿足長度也缺小寫，應先報長度
    const cb = run('A1')
    expect(cb.mock.calls[0][0].message).toBe('密碼至少 8 個字元')
  })
})
