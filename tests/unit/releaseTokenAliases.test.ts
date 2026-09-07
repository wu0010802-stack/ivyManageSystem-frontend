import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('上線修復 token 的亮暗色等值契約', () => {
  it('neutral 100/200 升格後保留 light/dark 原值與舊 alias', () => {
    for (const [path, values] of [
      ['src/assets/design-tokens.css', ['#f1f5f9', '#e2e8f0']],
      ['src/assets/a11y.css', ['#334155', '#475569']],
    ] as const) {
      const css = read(path)
      for (const [index, level] of [100, 200].entries()) {
        expect(css).toContain(`--color-neutral-${level}: ${values[index]};`)
        expect(css).toContain(`--neutral-${level}: var(--color-neutral-${level});`)
      }
    }
  })
  it('家長綠色中階在亮暗色都沿用原值，既有引用仍可解析', () => {
    const css = read('src/parent/styles/globals.css')
    expect(css).toContain('--color-green-mid: #41a074;')
    expect(css).toContain('--color-green-mid: #6dc068;')
    expect(css.match(/--ivy-green-mid: var\(--color-green-mid\);/g)).toHaveLength(2)
  })
})


const block = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start) + 1)
}

describe('Portal 局部與高對比主題 alias 等值', () => {
  const names = ['text-strong', 'text-body', 'text-muted', 'text-soft', 'text-faint']
  it.each([
    ['.portal-layout', ['#0f172a', '#1e293b', '#334155', '#334155', '#475569'], '#ffffff', '#f3f4f6'],
    ['html.dark .portal-layout', ['#f1f5f9', '#e2e8f0', '#cbd5e1', '#cbd5e1', '#94a3b8'], '#1e293b', '#263449'],
  ])('保留 %s 的局部文字與表面色', (selector, values, card, mute) => {
    const css = block(read('src/layouts/PortalLayout.vue'), selector as string)
    names.forEach((name, index) => {
      expect(css).toContain(`--color-portal-${name}: ${values[index]};`)
      expect(css).toContain(`--pt-${name}: var(--color-portal-${name});`)
    })
    expect(css).toContain(`--color-portal-surface-card: ${card};`)
    expect(css).toContain(`--color-portal-surface-mute: ${mute};`)
  })
  it.each([
    ['html.ivy-contrast-high', ['#000000', '#000000', '#1a1d20', '#2e3338', '#424850']],
    ['html.ivy-contrast-high[data-theme="dark"]', ['#ffffff', '#ffffff', '#f1f5f9', '#cbd5e1', '#cbd5e1']],
  ])('保留 %s 的高對比文字', (selector, values) => {
    const css = block(read('src/assets/a11y.css'), selector as string)
    names.forEach((name, index) => {
      expect(css).toContain(`--color-portal-${name}: ${values[index]};`)
      expect(css).toContain(`--pt-${name}: var(--color-portal-${name});`)
    })
  })
})
