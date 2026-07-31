/**
 * 登入/綁定成功後導回原頁的目的地驗證。
 *
 * `redirect` 這個值來自 URL query string（使用者可控、且家長端入口常是
 * LINE 推播點進來的釣魚面），因此在拿去 router.replace() 或
 * window.location.hash 之前，必須先驗證它「只能是站內相對路徑」，任何
 * 不符合的輸入一律當作不安全，由呼叫端 fallback 回 /home。
 */
import { describe, it, expect } from 'vitest'
import { isSafeRedirectPath, resolveSafeRedirect } from '../safeRedirect'

describe('isSafeRedirectPath', () => {
  it.each([
    ['/home', true, '一般站內路徑'],
    ['/', true, '根路徑'],
    ['/messages/123', true, '帶參數段的站內路徑'],
    ['/contact-book/5?tab=reply', true, '帶 query string 的站內路徑'],
    ['/me/privacy-rights', true, '多層站內路徑'],
    ['https://evil.com', false, '絕對 URL（https）'],
    ['http://evil.com', false, '絕對 URL（http）'],
    ['//evil.com', false, '協議相對路徑（雙斜線）'],
    ['///evil.com', false, '協議相對路徑（三斜線變形）'],
    ['/\\evil.com', false, '斜線+反斜線混合，瀏覽器可能當協議相對解析'],
    ['\\\\evil.com', false, '純反斜線開頭'],
    ['\\evil.com', false, '單反斜線開頭'],
    ['evil.com', false, '非 / 開頭的裸網域'],
    ['', false, '空字串'],
    ['javascript:alert(1)', false, 'javascript: 偽協議（非 / 開頭）'],
    [' /home', false, '前導空白'],
    ['/home ', false, '尾隨空白'],
    ['/\n/evil.com', false, '含換行控制字元'],
    ['/\t/evil.com', false, '含 tab 控制字元'],
  ])('%s → %s（%s）', (input, expected) => {
    expect(isSafeRedirectPath(input)).toBe(expected)
  })

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    [123, '數字'],
    [['/home'], '陣列（vue-router 重複 query key 時的型別）'],
    [{}, '物件'],
  ])('非字串型別 %s（%s）一律視為不安全', (input) => {
    expect(isSafeRedirectPath(input)).toBe(false)
  })
})

describe('resolveSafeRedirect', () => {
  it('安全路徑：原樣回傳', () => {
    expect(resolveSafeRedirect('/messages/123')).toBe('/messages/123')
  })

  it('不安全路徑：fallback 回 /home', () => {
    expect(resolveSafeRedirect('https://evil.com')).toBe('/home')
    expect(resolveSafeRedirect('//evil.com')).toBe('/home')
  })

  it('缺值（null/undefined/空字串）：fallback 回 /home', () => {
    expect(resolveSafeRedirect(null)).toBe('/home')
    expect(resolveSafeRedirect(undefined)).toBe('/home')
    expect(resolveSafeRedirect('')).toBe('/home')
  })

  it('呼叫端可自訂 fallback（例如綁定流程想固定回 /home 以外的頁）', () => {
    expect(resolveSafeRedirect('https://evil.com', '/me')).toBe('/me')
  })
})
