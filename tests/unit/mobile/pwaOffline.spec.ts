import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cfg = () => readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf-8')

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

  it('PWA manifest theme_color 與 index.html meta 對齊 (#4f46e5)', () => {
    expect(cfg()).toContain("theme_color: '#4f46e5'")
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
