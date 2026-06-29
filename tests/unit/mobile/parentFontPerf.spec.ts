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
  it('parent.html 字型 link 非阻塞（media=print onload）', () => {
    const html = read('parent.html')
    // 排除 noscript 的部分，只看主要 link
    const headContent = html.split('<noscript>')[0]
    const fontLinks = headContent.match(/<link[^>]*rel="stylesheet"[^>]*fonts\.googleapis\.com[^>]*>/g) || []
    expect(fontLinks.length).toBeGreaterThanOrEqual(2)
    fontLinks.forEach((l) => {
      expect(l).toContain("media=\"print\"")
      expect(l).toContain("onload=\"this.media='all'\"")
    })
  })
  it('vite.config workbox 有 google-fonts runtimeCaching', () => {
    const cfg = read('vite.config.js')
    expect(cfg).toContain('fonts.gstatic.com')
    expect(cfg).toContain("handler: 'CacheFirst'")
    expect(cfg).toContain("cacheName: 'google-fonts'")
    expect(cfg).toContain('statuses: [0, 200]')
  })
  it('parent.html noscript 後備為同步載入（無 media=print）', () => {
    const html = read('parent.html')
    const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] || ''
    const links = noscript.match(/<link[^>]*>/g) || []
    expect(links.length).toBe(2)
    links.forEach((l) => expect(l).not.toContain('media="print"'))
  })
})
