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
})
