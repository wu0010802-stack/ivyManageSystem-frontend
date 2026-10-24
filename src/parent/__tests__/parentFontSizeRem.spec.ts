import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

/**
 * 家長端字級守衛：font-size / line-height 一律用 rem（或 var(--text-*)），不得寫死 px。
 *
 * 「外觀設定 → 字級」（useA11y → html.ivy-size-*）是透過根字級
 * （globals.css 的 `html { font-size: calc(16px * var(--ivy-font-scale)) }`）生效的；
 * 寫死 px 的字不會跟著放大——2026-10 盤點時 454 處 px 字級，長輩選「2xl」後
 * 待辦頁 49 段文字只有 1 段放大。
 *
 * 豁免：
 *  - 系統 chrome（底部導覽列、頂部 app bar）比照 iOS/Android 慣例不跟字級縮放，避免固定高度被撐破
 *  - 圖示字型 / emoji 尺寸綁在固定方塊裡，選擇器含 icon / material-symbols / emoji / glyph 者不放大
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const parentDir = path.join(repoRoot, 'src/parent')

const EXEMPT_FILES = new Set([
  'src/parent/components/m3/M3NavigationBar.vue',
  'src/parent/components/m3/M3TopAppBar.vue',
  'src/parent/styles/icons.css',
])
const EXEMPT_SELECTOR = /material-symbols|icon|emoji|glyph/i
const PX_VALUE = /^-?\d*\.?\d+px(\s*!important)?$/

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    if (fs.statSync(abs).isDirectory()) {
      if (name !== '__tests__') collectFiles(abs, out)
    } else if (/\.(vue|css)$/.test(name)) {
      out.push(abs)
    }
  }
  return out
}

function styleBlocks(abs: string): string[] {
  const src = fs.readFileSync(abs, 'utf8')
  if (abs.endsWith('.css')) return [src]
  return [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
}

function findPxTypography(): string[] {
  const offenders: string[] = []
  for (const abs of collectFiles(parentDir)) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/')
    if (EXEMPT_FILES.has(rel)) continue
    for (const css of styleBlocks(abs)) {
      postcss.parse(css).walkDecls((decl) => {
        if (decl.prop !== 'font-size' && decl.prop !== 'line-height') return
        if (!PX_VALUE.test(decl.value.trim())) return
        const parent = decl.parent
        const selector = parent && parent.type === 'rule' ? (parent as postcss.Rule).selector : ''
        if (EXEMPT_SELECTOR.test(selector)) return
        offenders.push(`${rel} → ${selector || '(root)'} { ${decl.prop}: ${decl.value} }`)
      })
    }
  }
  return offenders
}

describe('家長端字級隨「字級設定」縮放', () => {
  it('font-size / line-height 不寫死 px（改用 rem 或 var(--text-*)）', () => {
    const offenders = findPxTypography()
    expect(
      offenders,
      `以下宣告寫死 px，家長調大字級時不會跟著放大；請改成 rem（px ÷ 16）：\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('根字級綁定 --ivy-font-scale', () => {
    const globals = fs.readFileSync(path.join(parentDir, 'styles/globals.css'), 'utf8')
    expect(globals).toMatch(/html\s*\{[^}]*font-size:\s*calc\(16px \* var\(--ivy-font-scale, 1\)\)/)
  })
})
