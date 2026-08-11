// @vitest-environment jsdom
// 用 jsdom（瀏覽器精確解析）而非預設 happy-dom：DOMPurify 的清洗依賴瀏覽器級
// HTML parser，happy-dom 解析差異會讓輸出形態不同，比照
// src/parent/components/assistant/__tests__/FaqAnswer.spec.ts 的既有處理。
import { describe, it, expect } from 'vitest'
import { renderMd, blobToDataUrl, canSubmit } from '../mdRender'

describe('renderMd', () => {
  it('轉換標題與清單', () => {
    const html = renderMd('### 標題\n- 項目一\n- 項目二')
    expect(html).toContain('<h3')
    expect(html).toContain('標題')
    expect(html).toContain('<li>項目一</li>')
  })

  it('轉換粗體', () => {
    expect(renderMd('**重要**')).toContain('<strong>重要</strong>')
  })

  it('消毒 script 注入', () => {
    const html = renderMd('內容 <script>alert(1)</script> 結尾')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert(1)')
  })

  it('變數殘留（{{student_name}}）不應被解析成 markdown 語法、原樣輸出', () => {
    // 正常流程下 {{student_name}} 應已在後端發送時代入，這裡驗證萬一殘留
    // 也不會讓渲染爆炸或被吃掉——只是原樣顯示文字。
    const html = renderMd('{{student_name}} 同學')
    expect(html).toContain('{{student_name}}')
  })

  it('空字串不拋錯', () => {
    expect(() => renderMd('')).not.toThrow()
  })
})

describe('blobToDataUrl', () => {
  it('回傳 data:image/png;base64 開頭的字串', async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    const url = await blobToDataUrl(blob)
    expect(url).toMatch(/^data:image\/png;base64,/)
  })
})

describe('canSubmit', () => {
  it('三者皆滿足才回 true', () => {
    expect(canSubmit(true, true, true)).toBe(true)
  })

  it.each([
    [false, true, true],
    [true, false, true],
    [true, true, false],
    [false, false, false],
  ])('scrolledToBottom=%s confirmedRead=%s hasSignature=%s → false', (a, b, c) => {
    expect(canSubmit(a, b, c)).toBe(false)
  })
})
