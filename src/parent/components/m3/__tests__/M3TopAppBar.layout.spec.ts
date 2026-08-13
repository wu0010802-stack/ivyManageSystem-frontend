/**
 * M3TopAppBar 版面守衛（2026-08-13 家長端 QA 巡檢）。
 *
 * 基底 `.m3-top-app-bar` 是 `display: grid` 且三個子元素都以
 * `grid-area: leading / title / actions` 指定具名區域；但基底規則若沒宣告
 * `grid-template-areas`，具名區域不存在 → 三個子元素全部掉進隱式軌道、
 * 疊在 header 右上角（實測 back/title/actions 三者 x 座標全在 ~342px），
 * 家長端**所有頁面** header 跑版。happy-dom 不做 grid 佈局，mount 測不出，
 * 故以 SFC 原始碼守衛（比照 tests/unit/mobile 的 parent.html 政策守衛手法）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// vitest 下 import.meta.url 非 file: scheme，改以 repo 根目錄組路徑。
const SRC = readFileSync(
  resolve(process.cwd(), 'src/parent/components/m3/M3TopAppBar.vue'),
  'utf-8',
)

describe('M3TopAppBar 基底 grid 版面', () => {
  it('基底 .m3-top-app-bar 規則必須宣告 grid-template-areas "leading title actions"', () => {
    const baseRule = SRC.split('.m3-top-app-bar {')[1]?.split('}')[0] ?? ''
    expect(baseRule, '找不到基底 .m3-top-app-bar 規則').not.toBe('')
    expect(baseRule).toContain('grid-template-areas')
    expect(baseRule).toMatch(/"leading title actions"/)
  })

  it('三個子元素仍以具名 grid-area 佈局（與模板宣告對齊）', () => {
    expect(SRC).toContain('grid-area: leading')
    expect(SRC).toContain('grid-area: title')
    expect(SRC).toContain('grid-area: actions')
  })
})
