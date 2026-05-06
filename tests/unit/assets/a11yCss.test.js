import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const cssPath = resolve('src/assets/a11y.css')

describe('a11y.css 高對比深色 selector', () => {
  it('不讓 ivy-contrast-high 在亮色環境誤套深色 token', () => {
    const css = readFileSync(cssPath, 'utf8')

    // useTheme 永遠顯式設 data-theme，因此只需單一 [data-theme="dark"] 選擇器
    expect(css).toContain('html.ivy-contrast-high[data-theme="dark"]')

    // @media (prefers-color-scheme: dark) 已刪除（T7 follow-up：與 [data-theme="dark"]
    // 完全重複，屬 dead code；useTheme 不依賴 prefers-color-scheme 媒體查詢觸發 CSS）
    expect(css).not.toContain('@media (prefers-color-scheme: dark)')

    expect(css).not.toMatch(
      /html\.ivy-contrast-high\[data-theme="dark"\]\s*,\s*html\.ivy-contrast-high:not\(\[data-theme="light"\]\)/,
    )
  })
})
