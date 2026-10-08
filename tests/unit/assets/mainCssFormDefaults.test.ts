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
  it('手機斷點：dialog 內標籤規則用 (0,3,0) specificity 壓過 EP label-right，含 flex-start／text-align left', () => {
    const mobile = block('/* Dialog - responsive on mobile */')
    const selector = '.el-dialog .el-form .el-form-item__label'
    const selectorIndex = mobile.indexOf(selector)
    expect(selectorIndex, `找不到選擇器 ${selector}`).toBeGreaterThan(-1)
    const labelRule = mobile.slice(selectorIndex, selectorIndex + 600)
    expect(labelRule).toMatch(/justify-content:\s*flex-start/)
    expect(labelRule).toMatch(/text-align:\s*left/)
    // 舊的低 specificity 選擇器（(0,2,0)，輸給 EP .el-form--label-right .el-form-item__label）不應再出現
    expect(mobile).not.toMatch(/\.el-dialog \.el-form-item__label\s*\{/)
  })

  it('桌機：dialog 內非 inline 表單預設堆疊標籤，並排除 .form-labels-inline，包進 --bp-sm', () => {
    const desk = block('/* ========== Dialog 表單預設層')
    // 區塊必須位於 @media (--bp-sm) 內
    const bpSmIndex = desk.indexOf('@media (--bp-sm)')
    const selectorIndex = desk.indexOf('html.ivy-admin .el-dialog .el-form:not(.el-form--inline):not(.form-labels-inline)')
    expect(bpSmIndex, '@media (--bp-sm) 必須存在').toBeGreaterThan(-1)
    expect(selectorIndex, '.el-form 選擇器必須限定 html.ivy-admin（教師端 Portal 不吃桌機預設層）').toBeGreaterThan(-1)
    expect(bpSmIndex, '@media (--bp-sm) 應在選擇器之前').toBeLessThan(selectorIndex)
    // 既有規則檢查：限定 html.ivy-admin，不外溢教師端 Portal
    expect(desk).toMatch(/html\.ivy-admin \.el-dialog \.el-form:not\(\.el-form--inline\):not\(\.form-labels-inline\)/)
    expect(desk).toMatch(/\.el-form-item__label\s*\{[^}]*width:\s*auto\s*!important/)
    expect(desk).toMatch(/\.el-form-item__content\s*\{[^}]*margin-left:\s*0\s*!important/)
  })
})
