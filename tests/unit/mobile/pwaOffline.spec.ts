import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cfg = () => readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf-8')

describe('PWA 離線收斂', () => {
  it('navigateFallbackDenylist 排除 /public（不被餵 admin 外殼）', () => {
    const c = cfg().replace(/\s+/g, ' ')
    const denylist = c.match(/navigateFallbackDenylist:\s*\[(.*?)\]/)?.[1] ?? ''
    expect(denylist).toContain('/public')
  })

  it('globPatterns 精快取 parent.html 與 public.html', () => {
    const c = cfg()
    expect(c).toContain("'parent.html'")
    expect(c).toContain("'public.html'")
  })
})
