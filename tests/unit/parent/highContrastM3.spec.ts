import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 家長端高對比模式（html.ivy-contrast-high）必須同時覆寫 M3 色彩角色。
 *
 * 家長端 200+ 處直接用 --m3-*（大量 on-surface-variant／outline 當文字與框線），
 * 舊版高對比只改 --pt-*／--brand-*／--color-*，開啟後灰字細框照舊，且品牌變藍、
 * --m3-primary 仍綠。這裡鎖住：必要角色有覆寫、primary 對齊高對比 brand、
 * 對比達標，以及覆寫只掛在 ivy-contrast-high 底下（該 class 只有家長端會掛，admin 不受影響）。
 */
const a11y = readFileSync(resolve(__dirname, '../../../src/assets/a11y.css'), 'utf-8')
const m3 = readFileSync(resolve(__dirname, '../../../src/parent/styles/m3-tokens.css'), 'utf-8')

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `找不到 ${selector}`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('\n}', start))
}

function value(css: string, name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))
  expect(m, `缺 ${name}`).not.toBeNull()
  return m![1].toLowerCase()
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const REQUIRED = [
  '--m3-primary',
  '--m3-on-primary',
  '--m3-primary-container',
  '--m3-on-primary-container',
  '--m3-on-surface',
  '--m3-on-surface-variant',
  '--m3-outline',
  '--m3-outline-variant',
]

const darkAt = m3.indexOf(":root[data-theme='dark']")
const THEMES = [
  { name: 'light', selector: 'html.ivy-contrast-high', surface: value(m3.slice(0, darkAt), '--m3-surface') },
  { name: 'dark', selector: 'html.ivy-contrast-high[data-theme="dark"]', surface: value(m3.slice(darkAt), '--m3-surface') },
]

describe.each(THEMES)('高對比 $name：M3 色彩角色', ({ selector, surface }) => {
  const css = block(a11y, selector)

  it.each(REQUIRED)('覆寫 %s', (name) => {
    expect(css).toMatch(new RegExp(`${name}:\\s*#`))
  })

  it('--m3-primary 對齊高對比 --brand-primary（不再一邊藍一邊綠）', () => {
    expect(value(css, '--m3-primary')).toBe(value(css, '--brand-primary'))
  })

  it('文字角色 ≥7:1、主色配對 ≥4.5:1、框線 ≥3:1', () => {
    expect(contrast(value(css, '--m3-on-surface-variant'), surface)).toBeGreaterThanOrEqual(7)
    expect(contrast(value(css, '--m3-on-surface'), surface)).toBeGreaterThanOrEqual(7)
    expect(contrast(value(css, '--m3-on-primary'), value(css, '--m3-primary'))).toBeGreaterThanOrEqual(4.5)
    expect(
      contrast(value(css, '--m3-on-primary-container'), value(css, '--m3-primary-container')),
    ).toBeGreaterThanOrEqual(4.5)
    expect(contrast(value(css, '--m3-outline'), surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(value(css, '--m3-outline-variant'), surface)).toBeGreaterThanOrEqual(3)
  })
})

describe('高對比 M3 覆寫不外溢到 admin', () => {
  it('a11y.css 內所有 --m3-* 定義都在 ivy-contrast-high 選擇器底下', () => {
    const offenders: string[] = []
    for (const m of a11y.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/--m3-[a-z-]+\s*:/.test(m[2])) continue
      const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim()
      if (!selector.split(',').every((s) => s.includes('html.ivy-contrast-high'))) offenders.push(selector)
    }
    expect(offenders).toEqual([])
  })
})
