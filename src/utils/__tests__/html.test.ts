import { describe, it, expect } from 'vitest'
import { escapeHtml } from '@/utils/html'

describe('escapeHtml', () => {
  it('跳脫 < > & " \' 五個 HTML 敏感字元', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    )
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml('"quote"')).toBe('&quot;quote&quot;')
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })

  it('跳脫後不含可執行的 HTML 標籤（不會被當 element 解析）', () => {
    const out = escapeHtml('<script>alert(1)</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('null / undefined / 數字轉成字串後跳脫（不丟例外）', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(123)).toBe('123')
  })

  it('純文字原樣保留', () => {
    expect(escapeHtml('正常文字 abc')).toBe('正常文字 abc')
  })
})
