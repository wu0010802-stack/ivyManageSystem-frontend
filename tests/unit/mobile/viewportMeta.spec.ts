import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8')

describe('viewport meta — 三 entry 對齊（safe-area 生效前提）', () => {
  it.each(['index.html', 'parent.html', 'public.html'])(
    '%s 的 viewport 含 viewport-fit=cover',
    (file) => {
      const html = read(file)
      const viewport = html.match(/<meta name="viewport"[^>]*>/)?.[0] ?? ''
      expect(viewport).toContain('viewport-fit=cover')
    },
  )

  it('index.html theme-color 為 admin indigo #4f46e5', () => {
    expect(read('index.html')).toContain('content="#4f46e5"')
  })

  it('index.html 提供 noscript fallback', () => {
    expect(read('index.html')).toContain('<noscript>')
  })
})
