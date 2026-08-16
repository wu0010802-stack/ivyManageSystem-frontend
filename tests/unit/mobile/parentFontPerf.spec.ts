import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('家長端字型首屏效能', () => {
  // 2026-08-13 政策反轉：Material Symbols 是 ligature 圖示字型，display=swap
  // 會在字型未就緒時把圖示 render 成 check_circle 等英文原文撐爆版面
  // （LIFF「很多文字跑版」事故根因）。已改同源自架子集字型
  // （src/parent/styles/icons.css），舊「CDN + swap 消除 FOIT」斷言退場——
  // swap 只適用於文字字型（Noto），圖示字型必須 block + 夾盒。
  it('parent/index.html 不再引用 Material Symbols CDN（已自架子集字型）', () => {
    const html = read('parent/index.html')
    expect(html).not.toContain('fonts.googleapis.com/css2?family=Material+Symbols')
  })
  it('自架 icon 字型：@font-face font-display: block + 1em 夾盒守衛，禁 swap 回流', () => {
    const css = read('src/parent/styles/icons.css')
    expect(css).toMatch(/font-display:\s*block/)
    expect(css).not.toMatch(/font-display:\s*swap/)
    // 夾盒守衛：字型載入前/失敗時 ligature 原文被裁在 1em 內，版面不可能被撐爆
    expect(css).toMatch(/\.material-symbols-rounded\s*\{[^}]*width:\s*1em/s)
    expect(css).toMatch(/\.material-symbols-rounded\s*\{[^}]*overflow:\s*hidden/s)
  })
  it('Noto Sans TC 文字字型維持 display=swap（文字用 swap 正確，避免 FOIT）', () => {
    const html = read('parent/index.html')
    expect(html).toMatch(/Noto\+Sans\+TC[^"]*display=swap/)
  })
  it('parent/index.html 字型 link 同步載入（禁 media=print onload 非阻塞手法）', () => {
    // 2026-08-12 prod 事故：nginx CSP script-src 無 unsafe-inline，
    // media="print" onload="this.media='all'" 的 inline handler 被 CSP 擋下，
    // stylesheet 永遠停在 media=print → 圖示全 render 成 ligature 原文。
    // 字型 link 必須同步（無 media=print、無 onload）。
    const html = read('parent/index.html')
    const fontLinks = html.match(/<link[^>]*rel="stylesheet"[^>]*fonts\.googleapis\.com[^>]*>/g) || []
    expect(fontLinks.length).toBeGreaterThanOrEqual(1)
    fontLinks.forEach((l) => {
      expect(l).not.toContain('media="print"')
      expect(l).not.toContain('onload=')
    })
  })
  it('三個 entry HTML 禁任何 inline event handler（CSP script-src 無 unsafe-inline）', () => {
    for (const entry of ['index.html', 'parent/index.html', 'public.html']) {
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
