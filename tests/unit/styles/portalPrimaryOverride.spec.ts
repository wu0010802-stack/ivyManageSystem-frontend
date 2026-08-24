/**
 * tests/unit/styles/portalPrimaryOverride.spec.ts
 *
 * 教師端 EP 主色收斂 indigo：soft-ui.css 必須提供 html.ivy-portal:not(.dark)
 * 的 --el-color-primary 覆寫（比照 main.css 的 html.ivy-admin 青藍 scope），
 * 否則 portal 內 Element Plus 元件維持預設藍 #409eff 與 indigo 並存。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(
  resolve(process.cwd(), 'src/styles/portal/soft-ui.css'),
  'utf-8',
).replace(/\s+/g, ' ')

describe('portal EP primary override', () => {
  it('html.ivy-portal:not(.dark) 區塊存在且釘 --el-color-primary 為 indigo', () => {
    expect(css).toMatch(/html\.ivy-portal:not\(\.dark\)\s*\{[^}]*--el-color-primary:\s*#4f46e5/)
  })

  it('light-3/5/7/8/9 與 dark-2 全套齊備（EP hover/plain/disabled 態都吃得到）', () => {
    const block = css.match(/html\.ivy-portal:not\(\.dark\)\s*\{([^}]*)\}/)?.[1] ?? ''
    for (const n of ['light-3', 'light-5', 'light-7', 'light-8', 'light-9', 'dark-2']) {
      expect(block).toContain(`--el-color-primary-${n}:`)
    }
  })
})
