import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('家長端字型首屏效能', () => {
  it('parent.html Material Symbols 用 display=swap（非 block，消除 FOIT）', () => {
    const html = read('parent.html')
    expect(html).toContain('Material+Symbols+Rounded')
    expect(html).not.toMatch(/Material\+Symbols\+Rounded[^"]*display=block/)
    expect(html).toMatch(/Material\+Symbols\+Rounded[^"]*display=swap/)
  })
  it('parent.html 字型 link 同步載入（禁 media=print onload 非阻塞手法）', () => {
    // 2026-08-12 prod 事故：nginx CSP script-src 無 unsafe-inline，
    // media="print" onload="this.media='all'" 的 inline handler 被 CSP 擋下，
    // stylesheet 永遠停在 media=print → 圖示全 render 成 ligature 原文。
    // 字型 link 必須同步（無 media=print、無 onload）；FOIT 由 display=swap 處理。
    const html = read('parent.html')
    const fontLinks = html.match(/<link[^>]*rel="stylesheet"[^>]*fonts\.googleapis\.com[^>]*>/g) || []
    expect(fontLinks.length).toBeGreaterThanOrEqual(2)
    fontLinks.forEach((l) => {
      expect(l).not.toContain('media="print"')
      expect(l).not.toContain('onload=')
    })
  })
  it('三個 entry HTML 禁任何 inline event handler（CSP script-src 無 unsafe-inline）', () => {
    for (const entry of ['index.html', 'parent.html', 'public.html']) {
      const html = read(entry).replace(/<!--[\s\S]*?-->/g, '')
      // on<event>= 屬性在 CSP 下一律被擋且無錯誤畫面，靜默失效比壞掉更難查
      const inlineHandlers = html.match(/<[^>]+\son[a-z]+\s*=/gi) || []
      expect(inlineHandlers, `${entry} 含 inline event handler：${inlineHandlers.join(' | ')}`).toEqual([])
    }
  })
  it('vite.config workbox 有 google-fonts runtimeCaching', () => {
    const cfg = read('vite.config.js')
    expect(cfg).toContain('fonts.gstatic.com')
    expect(cfg).toContain("handler: 'CacheFirst'")
    expect(cfg).toContain("cacheName: 'google-fonts'")
    expect(cfg).toContain('statuses: [0, 200]')
  })
})
