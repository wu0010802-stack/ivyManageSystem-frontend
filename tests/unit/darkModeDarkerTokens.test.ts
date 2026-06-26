// @vitest-environment node
/**
 * 深色模式 *-darker token 對比修復（quick-win 2026-06-26）。
 *
 * design-tokens.css 的 --color-*-darker 是 light-mode 深 hex（#15803d / #b45309 / #b91c1c /
 * #1d4ed8），供 *-soft 淺底上的強調文字用。a11y.css 的 html.dark 區段把 *-soft 翻成深色 alpha
 * tint，卻完全沒覆寫 *-darker → 變成「深底 + 深字」，對比塌到 ~1.7-2.2:1 遠未達 WCAG AA；
 * 全站約 110 處 `color: var(--color-*-darker)` 文字色引用（badge / chip / KPI 強調值）同時受害。
 *
 * 本測試鎖住：a11y.css 必須在 dark scope 覆寫四個 *-darker（防止再被移除而靜默回歸）。
 * 一處集中覆寫即同時修正全部引用點，無需逐檔動。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const a11yCss = readFileSync(
  fileURLToPath(new URL('../../src/assets/a11y.css', import.meta.url)),
  'utf-8',
)

describe('深色模式 *-darker token 覆寫（WCAG AA 對比）', () => {
  it('a11y.css 含 html.dark 區段', () => {
    expect(a11yCss).toContain('html.dark')
  })

  it.each(['success', 'warning', 'danger', 'info'])(
    'a11y.css 的 dark scope 覆寫 --color-%s-darker',
    (tone) => {
      expect(a11yCss).toMatch(new RegExp(`--color-${tone}-darker\\s*:`))
    },
  )
})
