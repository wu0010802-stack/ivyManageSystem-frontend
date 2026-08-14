import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (name: string) =>
  readFileSync(resolve(__dirname, `../../../src/parent/components/m3/${name}.vue`), 'utf-8')

describe('m3 元件 Expressive 化（P1 批次一）', () => {
  it('M3Card 圓角走 token', () => {
    expect(read('M3Card')).toMatch(/border-radius:\s*var\(--pt-card-radius/)
  })
  it('M3Card elevated variant box-shadow 走 --pt-shadow-card', () => {
    expect(read('M3Card')).toMatch(/\.m3-card-elevated\s*\{[^}]*var\(--pt-shadow-card/s)
  })
  it('M3Chip 膠囊化', () => {
    expect(read('M3Chip')).toMatch(/\.m3-chip\s*\{[^}]*border-radius:\s*9999px/s)
  })
  it('M3TextField outlined 圓角走 control token', () => {
    expect(read('M3TextField')).toMatch(/\.m3-text-field-outlined[^{]*\{[^}]*var\(--pt-control-radius/s)
  })
  it('M3TextField filled 上圓角走 control token', () => {
    expect(read('M3TextField')).toMatch(/\.m3-text-field-filled[^{]*\{[^}]*var\(--pt-control-radius/s)
  })
  it.each(['M3Button', 'M3Card', 'M3IconButton', 'M3FAB'])('%s 有 spring 按壓回饋', (name) => {
    const src = read(name)
    expect(src).toMatch(/var\(--motion-spring/)
    expect(src).toContain('scale(0.96)')
  })
  it('M3FAB box-shadow 走 --pt-shadow-float', () => {
    expect(read('M3FAB')).toMatch(/\.m3-fab\s*\{[^}]*var\(--pt-shadow-float/s)
  })
})
