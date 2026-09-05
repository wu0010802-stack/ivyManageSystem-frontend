import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// main.css 的 dialog 表單預設層（spec 2026-09-06 §3.1）契約：
// 1) 手機斷點的標籤必須左對齊（EP label-right 是 inline-flex justify-content:flex-end，
//    只寫 text-align 蓋不掉）；2) 桌機 dialog 內表單預設堆疊標籤，且提供 opt-out class。
const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

function block(startMarker: string): string {
  const i = css.indexOf(startMarker)
  expect(i, `找不到區塊起點 ${startMarker}`).toBeGreaterThan(-1)
  return css.slice(i, i + 2500)
}

describe('main.css dialog 表單預設層', () => {
  it('手機斷點：dialog 內標籤規則含 justify-content: flex-start', () => {
    const mobile = block('/* Dialog - responsive on mobile */')
    const labelRule = mobile.slice(mobile.indexOf('.el-dialog .el-form-item__label'))
    expect(labelRule.slice(0, 600)).toMatch(/justify-content:\s*flex-start/)
  })

  it('桌機：dialog 內非 inline 表單預設堆疊標籤，並排除 .form-labels-inline', () => {
    const desk = block('/* ========== Dialog 表單預設層')
    expect(desk).toMatch(/\.el-dialog \.el-form:not\(\.el-form--inline\):not\(\.form-labels-inline\)/)
    expect(desk).toMatch(/\.el-form-item__label\s*\{[^}]*width:\s*auto\s*!important/)
    expect(desk).toMatch(/\.el-form-item__content\s*\{[^}]*margin-left:\s*0\s*!important/)
  })
})
