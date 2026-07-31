import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 公開報名頁的家長族群含中高齡長輩，而且這頁多半是在戶外用 LINE 內建瀏覽器開啟，
 * 對比不足不是理論問題。這裡直接從 public-theme.css 讀出 token 實際值算 WCAG 比值，
 * 讓「有人手動把某個色調亮一階」這種改動會直接紅掉而不是靜默劣化。
 *
 * 修正前的實測值（皆不過 AA）：CTA 白字 4.09、CTA hover 白字 2.83、
 * 深綠字配淺綠底 3.75、警示橘字配淺綠底 2.92。
 */
const css = readFileSync(resolve(__dirname, '../../../assets/public-theme.css'), 'utf-8')

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`public-theme.css 找不到 token --${name}`)
  return match[1]
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

const AA = 4.5

describe('public-theme.css 文字對比（WCAG AA 4.5:1）', () => {
  it('主 CTA 的白字過 AA', () => {
    expect(contrast(token('color-cta'), token('color-cta-contrast'))).toBeGreaterThanOrEqual(AA)
  })

  it('CTA hover 的白字過 AA，且 hover 必須比底色更深', () => {
    const base = token('color-cta')
    const hover = token('color-cta-hover')
    expect(contrast(hover, token('color-cta-contrast'))).toBeGreaterThanOrEqual(AA)
    // 原本 hover 比底色還亮，白字只剩 2.83:1
    expect(luminance(hover)).toBeLessThan(luminance(base))
  })

  it('深綠文字在白底與淺綠底都過 AA', () => {
    const strong = token('color-primary-strong')
    expect(contrast(strong, '#ffffff')).toBeGreaterThanOrEqual(AA)
    expect(contrast(strong, token('color-primary-soft'))).toBeGreaterThanOrEqual(AA)
    expect(contrast(strong, token('color-surface-mint'))).toBeGreaterThanOrEqual(AA)
  })

  it('警示文字在淺綠底過 AA（成功畫面的個資警語就印在這個底色上）', () => {
    expect(
      contrast(token('color-warning-strong'), token('color-primary-soft')),
    ).toBeGreaterThanOrEqual(AA)
  })

  it('白字壓在深綠底上的圓標／按鈕 hover 過 AA', () => {
    expect(
      contrast(token('color-primary-strong'), token('color-primary-contrast')),
    ).toBeGreaterThanOrEqual(AA)
  })
})
