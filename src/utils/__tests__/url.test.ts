import { describe, it, expect } from 'vitest'
import { isSafeHttpUrl, sanitizeHref } from '@/utils/url'

describe('isSafeHttpUrl', () => {
  it('放行 http / https', () => {
    expect(isSafeHttpUrl('http://example.com')).toBe(true)
    expect(isSafeHttpUrl('https://example.com/path?x=1')).toBe(true)
  })

  it('擋 javascript: scheme（大小寫 / 前綴空白 / tab 變體）', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('JavaScript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('  javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('java\tscript:alert(1)')).toBe(false)
  })

  it('擋 data: / vbscript: / file: 等非 http(s) scheme', () => {
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeHttpUrl('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false)
  })

  it('擋空值 / 非字串', () => {
    expect(isSafeHttpUrl('')).toBe(false)
    expect(isSafeHttpUrl(null)).toBe(false)
    expect(isSafeHttpUrl(undefined)).toBe(false)
    expect(isSafeHttpUrl(123)).toBe(false)
  })

  it('擋無 scheme 的相對 / 協定相對 URL（避免被瀏覽器當前頁 scheme 解析出非預期行為）', () => {
    expect(isSafeHttpUrl('/relative/path')).toBe(false)
    expect(isSafeHttpUrl('example.com')).toBe(false)
    expect(isSafeHttpUrl('//evil.com')).toBe(false)
  })
})

describe('sanitizeHref', () => {
  it('安全 http(s) URL 原樣回傳', () => {
    expect(sanitizeHref('https://x.com')).toBe('https://x.com')
    expect(sanitizeHref('http://x.com/a?b=1')).toBe('http://x.com/a?b=1')
  })

  it('javascript: 回 undefined（儲存型 XSS 防護）', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBeUndefined()
    expect(sanitizeHref('  JavaScript:alert(1)')).toBeUndefined()
  })

  it('data: / 空值 / 非字串回 undefined', () => {
    expect(sanitizeHref('data:text/html,x')).toBeUndefined()
    expect(sanitizeHref('')).toBeUndefined()
    expect(sanitizeHref(null)).toBeUndefined()
    expect(sanitizeHref(undefined)).toBeUndefined()
  })
})
