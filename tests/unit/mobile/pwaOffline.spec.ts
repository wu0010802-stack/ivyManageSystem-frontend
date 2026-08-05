import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cfg = () => readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf-8')
const adminManifest = () => readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf-8')

describe('PWA 離線收斂', () => {
  it('navigateFallbackDenylist 排除 /public.html 與 /public/ 兩種路徑', () => {
    const c = cfg()
    expect(c).toContain('/^\\/public\\.html/')
    expect(c).toContain('/^\\/public\\//')
  })

  it('globPatterns 精快取 parent.html 與 public.html', () => {
    const c = cfg()
    expect(c).toContain("'parent.html'")
    expect(c).toContain("'public.html'")
  })

  it('PWA manifest theme_color 與 index.html meta 用同一個 token，展開後皆為 #4f46e5', () => {
    // 多租戶（4d/fb，CT-F-02）：兩處都改 token，由 nginx sub_filter 依 $host 注入。
    // 用「同一個 token」比「同一個字面」更強：它保證兩邊永遠不可能漂開。
    expect(JSON.parse(adminManifest()).theme_color).toBe('{{TB_THEME_ADMIN}}')
    expect(readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8'))
      .toContain('<meta name="theme-color" content="{{TB_THEME_ADMIN}}">')
    // 灰度不變式：default 租戶展開後仍是原本的 admin indigo
    const branding = JSON.parse(readFileSync(resolve(process.cwd(), 'branding/tenants.json'), 'utf-8'))
    const def = branding.tenants.find((t: { default?: boolean }) => t.default === true)
    expect(def.tokens.TB_THEME_ADMIN).toBe('#4f46e5')
  })

  it('三份 manifest 已移出 precache，brand-version.json 已進 precache（CT-F-04）', () => {
    const c = cfg()
    // token 化後 dist 對所有租戶內容相同 → 若 manifest 還留在 precache，
    // 已安裝 PWA 的品牌會永遠停在安裝當下那一版。
    expect(c).not.toContain("'manifest.webmanifest',")
    expect(c).not.toContain("'parent.webmanifest',")
    expect(c).not.toContain("'public.webmanifest',")
    // brand-version.json 是「品牌改動能傳到已安裝 PWA」的唯一機制，刪掉就靜默失效。
    expect(c).toContain("'brand-version.json'")
  })

  it('品牌資產走 brand-assets SWR，且規則排在 app-images 之前（先匹配先贏）', () => {
    const c = cfg()
    const brandRule = c.indexOf("cacheName: 'brand-assets'")
    const imagesRule = c.indexOf("cacheName: 'app-images'")
    expect(brandRule).toBeGreaterThan(-1)
    expect(imagesRule).toBeGreaterThan(brandRule)
    // per-tenant overlay 換圖後 URL 不變，CacheFirst 會永遠回舊圖
    expect(c.slice(brandRule - 400, brandRule)).toContain("handler: 'StaleWhileRevalidate'")
    // 品牌資產不得留在 precache（revision 來自 build 時的預設檔，換不掉）
    expect(c).toContain('includeAssets: []')
  })

  it('所有家長/Portal 個人化 GET API 只走 NetworkOnly，不建立 response cache', () => {
    const c = cfg()
    const start = c.indexOf('// ─── 個人化 API')
    const end = c.indexOf('// 注意：POST', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const personalized = c.slice(start, end)
    expect(personalized).toContain("url.pathname.startsWith('/api/portal')")
    expect(personalized).toContain("url.pathname.startsWith('/api/parent')")
    expect(personalized.match(/handler: 'NetworkOnly'/g)).toHaveLength(2)
    expect(personalized).not.toMatch(/NetworkFirst|CacheFirst|StaleWhileRevalidate/)
    expect(personalized).not.toContain('cacheName:')
  })
})
