import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 公開報名頁的分享預覽卡完全由 public.html 的靜態標籤決定：LINE 的爬蟲不執行 JS，
 * router 設的 document.title 對它無效。這些標籤一旦被移除，老師貼到家長群組的連結
 * 就會退回一條沒有標題與縮圖的裸網址，而且沒有任何執行期錯誤會提醒我們。
 *
 * 多租戶（4d/fb，CT-F-02）：這些欄位改成 `{{TB_*}}` token，真正的值由 nginx
 * `sub_filter` 依 $host 注入。本檔因此改成**雙態斷言**：
 *   (1) HTML 內是 token（鎖住「不得退回硬編品牌」）
 *   (2) `branding/tenants.json` 的 **default 條目**展開後仍符合改造前的原斷言
 *       （鎖住單租戶輸出等價，也就是灰度不變式）
 */
const html = readFileSync(resolve(__dirname, '../../public.html'), 'utf-8')
const branding = JSON.parse(readFileSync(resolve(__dirname, '../../branding/tenants.json'), 'utf-8'))
const defaultTenant = branding.tenants.find((t) => t.default === true)
/** 用 default 條目把 HTML 的 token 展開，模擬 nginx 對 default tenant 的輸出。 */
const expanded = html.replace(/\{\{(TB_[A-Z0-9_]+)\}\}/g, (whole, key) =>
  key === 'TB_ORIGIN' ? defaultTenant.origin : (defaultTenant.tokens[key] ?? whole),
)

describe('public.html 分享預覽標籤', () => {
  it('具備 LINE / OG 預覽卡所需的四個標籤', () => {
    expect(html).toContain('property="og:title"')
    expect(html).toContain('property="og:description"')
    expect(html).toContain('property="og:image"')
    expect(html).toContain('property="og:url"')
  })

  it('og:image 是 token 形式，且 default 租戶展開後仍是絕對網址', () => {
    const raw = html.match(/property="og:image"\s+content="([^"]+)"/)
    expect(raw).not.toBeNull()
    // token 形式：網域不得再硬編（多租戶下硬編 = 所有租戶共用同一張海報網址）
    expect(raw?.[1]).toMatch(/^\{\{TB_ORIGIN\}\}/)
    // 灰度不變式：default 租戶展開後與改造前逐字同型
    const match = expanded.match(/property="og:image"\s+content="([^"]+)"/)
    expect(match?.[1]).toMatch(/^https:\/\//)
  })

  it('og:url 指向 public.html 的報名路由，而非 admin SPA fallback', () => {
    const match = html.match(/property="og:url"\s+content="([^"]+)"/)
    expect(match?.[1]).toContain('/public.html#/activity')
    expect(match?.[1]).not.toContain('index.html')
  })

  it('title 與 description 用家長看得懂的說法，不是系統代號', () => {
    // HTML 內是 token
    expect(html).toContain('<title>{{TB_PUBLIC_TITLE}}</title>')
    expect(html).toContain('name="description"')
    // default 租戶展開後仍符合改造前的原斷言
    expect(expanded).toMatch(/<title>[^<]*才藝[^<]*報名[^<]*<\/title>/)
  })

  it('展開後不得殘留任何 {{TB_ 佔位（tenants.json 缺 key 會讓家長看到亂碼）', () => {
    expect(expanded).not.toContain('{{TB_')
  })
})
