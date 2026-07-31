import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 公開報名頁的分享預覽卡完全由 public.html 的靜態標籤決定：LINE 的爬蟲不執行 JS，
 * router 設的 document.title 對它無效。這些標籤一旦被移除，老師貼到家長群組的連結
 * 就會退回一條沒有標題與縮圖的裸網址，而且沒有任何執行期錯誤會提醒我們。
 */
const html = readFileSync(resolve(__dirname, '../../public.html'), 'utf-8')

describe('public.html 分享預覽標籤', () => {
  it('具備 LINE / OG 預覽卡所需的四個標籤', () => {
    expect(html).toContain('property="og:title"')
    expect(html).toContain('property="og:description"')
    expect(html).toContain('property="og:image"')
    expect(html).toContain('property="og:url"')
  })

  it('og:image 是絕對網址（相對路徑不保證被爬蟲解析）', () => {
    const match = html.match(/property="og:image"\s+content="([^"]+)"/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(/^https:\/\//)
  })

  it('og:url 指向 public.html 的報名路由，而非 admin SPA fallback', () => {
    const match = html.match(/property="og:url"\s+content="([^"]+)"/)
    expect(match?.[1]).toContain('/public.html#/activity')
    expect(match?.[1]).not.toContain('index.html')
  })

  it('title 與 description 用家長看得懂的說法，不是系統代號', () => {
    expect(html).toMatch(/<title>[^<]*才藝[^<]*報名[^<]*<\/title>/)
    expect(html).toContain('name="description"')
  })
})
