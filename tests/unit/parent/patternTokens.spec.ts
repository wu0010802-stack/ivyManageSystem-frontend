import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/patterns.css'), 'utf-8')

describe('patterns.css Expressive 對齊（P1）', () => {
  it('.pt-card 圓角走 token 不寫死', () => {
    expect(css).toMatch(/\.pt-card\s*\{[^}]*border-radius:\s*var\(--pt-card-radius/s)
    expect(css).not.toMatch(/\.pt-card\s*\{[^}]*border-radius:\s*18px/s)
  })
  it('.pt-card box-shadow 走 --pt-shadow-card', () => {
    expect(css).toMatch(/\.pt-card\s*\{[^}]*var\(--pt-shadow-card\)/s)
  })
  it('.pt-page-hero 用 hero 漸層 token 與 hero 圓角', () => {
    expect(css).toMatch(/\.pt-page-hero\s*\{[^}]*var\(--pt-gradient-hero\)/s)
    expect(css).toMatch(/\.pt-page-hero\s*\{[^}]*var\(--pt-hero-radius/s)
  })
  it('.pt-action-btn 維持膠囊圓角並升級字重與 spring 按壓回饋', () => {
    expect(css).toMatch(/\.pt-action-btn\s*\{[^}]*border-radius:\s*999px/s)
    expect(css).toMatch(/\.pt-action-btn\s*\{[^}]*font-weight:\s*800/s)
    expect(css).toMatch(/var\(--motion-spring/)
  })
  it('互動 utility 過渡時長改消費語意動效 token', () => {
    expect(css).toMatch(/var\(--motion-quick/)
    expect(css).not.toContain('background 160ms ease')
  })
  it('reduced-motion 段涵蓋 .pt-card-link 類的按壓變形（若有新增 transform 需一併降階）', () => {
    const reducedBlock = css.slice(css.indexOf('prefers-reduced-motion'))
    expect(reducedBlock).toContain('.pt-action-btn')
  })
})
