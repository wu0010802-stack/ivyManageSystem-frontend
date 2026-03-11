import { describe, it, expect } from 'vitest'
import { highlight } from '@/utils/highlight'

describe('highlight()', () => {
  it('text 為 null 回傳空字串', () => {
    expect(highlight(null, 'foo')).toBe('')
  })

  it('text 為 undefined 回傳空字串', () => {
    expect(highlight(undefined, 'foo')).toBe('')
  })

  it('keyword 為空字串時，回傳跳脫後原文（不添加 mark）', () => {
    expect(highlight('hello', '')).toBe('hello')
  })

  it('keyword 為空白字串時，回傳跳脫後原文', () => {
    expect(highlight('hello', '   ')).toBe('hello')
  })

  it('keyword 為 null 時，回傳跳脫後原文', () => {
    expect(highlight('hello', null)).toBe('hello')
  })

  it('找到關鍵字時包裹 mark 標籤', () => {
    const result = highlight('王小明', '小')
    expect(result).toBe('王<mark class="search-highlight">小</mark>明')
  })

  it('大小寫不分（gi flag）', () => {
    const result = highlight('Hello World', 'hello')
    expect(result).toBe('<mark class="search-highlight">Hello</mark> World')
  })

  it('多個符合都被高亮', () => {
    const result = highlight('abc abc', 'abc')
    expect(result).toBe(
      '<mark class="search-highlight">abc</mark> <mark class="search-highlight">abc</mark>',
    )
  })

  it('HTML 特殊字元先跳脫再高亮，防止 XSS', () => {
    const result = highlight('<script>alert(1)</script>', 'script')
    expect(result).toContain('&lt;')
    expect(result).toContain('&gt;')
    expect(result).not.toContain('<script>')
    expect(result).toContain('<mark class="search-highlight">script</mark>')
  })

  it('& 符號被跳脫為 &amp;（使用不衝突的 keyword）', () => {
    // 用 'B' 當 keyword，確保 &amp; 不被拆開
    const result = highlight('A & B', 'B')
    expect(result).toContain('&amp;')
    expect(result).toContain('<mark class="search-highlight">B</mark>')
  })

  it('關鍵字含 RegExp 特殊字元不崩潰', () => {
    expect(() => highlight('100% done', '100%')).not.toThrow()
    const result = highlight('100% done', '100%')
    expect(result).toContain('<mark class="search-highlight">100%</mark>')
  })

  it('非字串 text 自動轉型（數字）', () => {
    const result = highlight(12345, '234')
    expect(result).toBe('1<mark class="search-highlight">234</mark>5')
  })
})
