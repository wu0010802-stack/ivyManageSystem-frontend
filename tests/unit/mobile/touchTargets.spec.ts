import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8').replace(/\s+/g, ' ')

/** 取出 main.css 中「手機觸控尺寸基準」那段 @media 區塊 */
function touchBlock(): string {
  const css = read('src/assets/main.css')
  const start = css.indexOf('手機觸控尺寸基準')
  expect(start).toBeGreaterThan(-1)
  const media = css.indexOf('@media (--to-sm) {', start)
  // 到「教師端平板」延伸段為止（那段刻意包含表格內規則）
  const end = css.indexOf('教師端平板', media)
  expect(end).toBeGreaterThan(media)
  return css.slice(media, end)
}

describe('手機觸控尺寸基準（main.css）', () => {
  it('預設尺寸按鈕／下拉／輸入撐到 --touch-target-min，small 撐到 36px', () => {
    const block = touchBlock()
    expect(block).toMatch(/\.el-button:not\(\.is-link\):not\(\.is-text\)[^{]*\{ min-height: var\(--touch-target-min\);/)
    expect(block).toMatch(/\.el-button\.el-button--small[^{]*\{ min-height: 36px;/)
    expect(block).toMatch(/\.el-select:not\([^{]*\.el-select__wrapper \{ min-height: var\(--touch-target-min\);/)
    expect(block).toMatch(/--el-input-height: var\(--touch-target-min\);/)
    expect(block).toMatch(/--el-input-height: 36px;/)
  })

  it('表格內與分頁器不套用（避免撐爆列高）', () => {
    const block = touchBlock()
    const rules = block.split('}').filter(r => /min-height|--el-input-height/.test(r) && !/range-input|range-separator/.test(r))
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule).toContain(':not(.el-table *)')
    }
  })

  it('文字／連結型按鈕排除在外', () => {
    const block = touchBlock()
    for (const rule of block.split('}').filter(r => r.includes('.el-button'))) {
      expect(rule).toContain(':not(.is-link):not(.is-text)')
    }
  })

  it('分頁鈕在手機放大到 36px（含 small）', () => {
    const css = read('src/assets/main.css')
    expect(css).toMatch(/\.el-pagination\.el-pagination \{[^}]*--el-pagination-button-height-small: 36px;/)
  })

  it('.controls 換行工具列去掉 EP 相鄰按鈕 margin-left（防鋸齒縮排）', () => {
    const css = read('src/assets/main.css')
    expect(css).toMatch(/\.controls \.el-button \+ \.el-button \{ margin-left: 0; \}/)
  })
})

describe('教師端平板觸控（DESIGN.md 教師端版面規則：不能只寫在窄幕斷點）', () => {
  function coarseBlock(): string {
    const css = read('src/assets/main.css')
    const start = css.indexOf('@media (pointer: coarse) and (min-width: 768px) {')
    expect(start).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('WCAG AA', start)).replace(/\/\*.*?\*\//g, '')
  }

  it('同一套基準以 html.ivy-portal 延伸到 pointer: coarse，管理端平板不受影響', () => {
    const block = coarseBlock()
    expect(block).toMatch(/html\.ivy-portal \.el-button:not\(\.is-link\)[^{]*\{ min-height: var\(--touch-target-min\);/)
    expect(block).toMatch(/html\.ivy-portal \.el-select:not\([^{]*\.el-select__wrapper \{ min-height: var\(--touch-target-min\);/)
    for (const rule of block.split('}').filter(r => r.includes('{'))) {
      expect(rule.trim().startsWith('html.ivy-portal') || rule.includes('@media')).toBe(true)
    }
  })

  it('平板表格列內動作撐到 36px、分頁鈕 36px', () => {
    const block = coarseBlock()
    expect(block).toMatch(/html\.ivy-portal \.el-table \.el-button\.el-button \{ min-height: 36px;/)
    expect(block).toMatch(/--el-pagination-button-height-small: 36px;/)
  })
})

describe('手機收起的側邊欄不得留陰影（視窗左緣灰帶）', () => {
  it('AdminSidebar .sidebar-mobile-hidden 拿掉 box-shadow', () => {
    expect(read('src/components/layout/AdminSidebar.vue')).toMatch(/\.sidebar-mobile-hidden \{[^}]*box-shadow: none;/)
  })

  it('PortalLayout .sidebar-hidden 拿掉 box-shadow', () => {
    expect(read('src/layouts/PortalLayout.vue')).toMatch(/\.sidebar-hidden \{[^}]*box-shadow: none;/)
  })
})
