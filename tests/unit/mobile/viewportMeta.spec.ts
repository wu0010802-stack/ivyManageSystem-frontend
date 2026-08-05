import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

/** `branding/tenants.json` 的 default 條目 tokens（L1 品牌值的單一事實來源）。 */
const defaultTokens = (): Record<string, string> =>
  JSON.parse(read('branding/tenants.json')).tenants.find(
    (t: { default?: boolean }) => t.default === true,
  ).tokens

describe('viewport meta — 三 entry 對齊（safe-area 生效前提）', () => {
  it.each(['index.html', 'parent.html', 'public.html'])(
    '%s 的 viewport 含 viewport-fit=cover',
    (file) => {
      const html = read(file)
      const viewport = html.match(/<meta name="viewport"[^>]*>/)?.[0] ?? ''
      expect(viewport).toContain('viewport-fit=cover')
    },
  )

  it('index.html theme-color 為 token，且 default 租戶值仍是 admin indigo #4f46e5', () => {
    // 多租戶（4d/fb，CT-F-02）：theme-color 由 nginx sub_filter 依 $host 注入。
    expect(read('index.html')).toContain('content="{{TB_THEME_ADMIN}}"')
    expect(defaultTokens().TB_THEME_ADMIN).toBe('#4f46e5')
  })

  it('index.html 提供 noscript fallback', () => {
    expect(read('index.html')).toContain('<noscript>')
  })
})
