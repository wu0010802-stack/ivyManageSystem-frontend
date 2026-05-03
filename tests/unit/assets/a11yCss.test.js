import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const cssPath = resolve('src/assets/a11y.css')

describe('a11y.css 高對比深色 selector', () => {
  it('不讓 ivy-contrast-high 在亮色環境誤套深色 token', () => {
    const css = readFileSync(cssPath, 'utf8')

    expect(css).toContain('html.ivy-contrast-high[data-theme="dark"]')
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).not.toMatch(
      /html\.ivy-contrast-high\[data-theme="dark"\]\s*,\s*html\.ivy-contrast-high:not\(\[data-theme="light"\]\)/,
    )
  })
})
