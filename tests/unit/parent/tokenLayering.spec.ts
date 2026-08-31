import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../../src/parent/styles/globals.css'), 'utf-8')
const darkStart = css.indexOf(":root[data-theme='dark']")
const light = css.slice(0, darkStart)
const dark = css.slice(darkStart)

describe('token 疊層收斂（M3 Expressive P1）', () => {
  it('Bento 冷調覆寫層已退場（段落標題與其專屬覆寫值不得殘留）', () => {
    expect(css).not.toContain('Bento 重設計')
    expect(css).not.toContain('Bento 冷調 dark slate')
    // Bento 段專屬（非其他區塊沿用）的 slate rgba 陰影公式
    expect(css).not.toContain('rgba(15, 23, 42, 0.06)')
    expect(css).not.toContain('rgba(15, 23, 42, 0.32)')
  })
  it('四個主力文字/表面 alias 不得是字面 hex，一律 var(--m3-...)（light/dark 皆同）', () => {
    const aliasPattern = /--pt-(text-strong|text-muted|text-faint|surface-card):\s*var\(--m3-/g
    expect((light.match(aliasPattern) || []).length).toBe(4)
    expect((dark.match(aliasPattern) || []).length).toBe(4)
  })
  it('globals.css 不再「定義」任何 --m3-* token（m3-tokens.css 為唯一真源，允許消費 var(--m3-...)）', () => {
    expect(css).not.toMatch(/^\s*--m3-[a-z-]+\s*:/m)
  })
  it('文字 alias 指向 m3 色彩角色（light/dark 皆同一指向）', () => {
    const strongPattern = /--pt-text-strong:\s*var\(--m3-on-surface\)/
    const mutedPattern = /--pt-text-muted:\s*var\(--m3-on-surface-variant\)/
    expect(light).toMatch(strongPattern)
    expect(light).toMatch(mutedPattern)
    expect(dark).toMatch(strongPattern)
    expect(dark).toMatch(mutedPattern)
  })
  it('暖底 app 背景 light/dark 成對，且 body 消費之', () => {
    expect(light).toContain('--pt-app-bg: #f7f6ef')
    expect(dark).toContain('--pt-app-bg: #141614')
    expect(css).toContain('background: var(--pt-app-bg')
  })
  it('守衛消費的 token 仍存在（--pt-on-accent / --color-primary-contrast 未隨 Bento 段誤刪）', () => {
    expect(css).toContain('--pt-on-accent:')
    expect(css).toContain('--color-primary-contrast:')
  })
  it('--pt-shadow-press 不再重複定義原始值，改 alias 到 --pt-shadow-card（light/dark 各一次）', () => {
    const lightPressCount = (light.match(/--pt-shadow-press:/g) || []).length
    const darkPressCount = (dark.match(/--pt-shadow-press:/g) || []).length
    expect(lightPressCount).toBe(1)
    expect(darkPressCount).toBe(1)
    expect(light).toContain('--pt-shadow-press: var(--pt-shadow-card)')
    expect(dark).toContain('--pt-shadow-press: var(--pt-shadow-card)')
  })
  it('尺度 token 升級到 Expressive 值', () => {
    expect(light).toContain('--pt-card-radius: 26px')
    expect(light).toContain('--pt-control-radius: 14px')
    expect(light).toContain('--pt-hero-radius: 30px')
  })
})
