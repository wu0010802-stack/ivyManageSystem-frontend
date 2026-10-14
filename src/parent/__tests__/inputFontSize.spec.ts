/**
 * 守衛：家長端輸入欄位字級不得小於 16px。
 *
 * 為什麼：iOS Safari / LINE LIFF WebView 在 font-size < 16px 的 input／textarea／select
 * 聚焦時會自動放大整頁，家長單手操作時畫面被拉歪、還得兩指縮回來。`parent/index.html`
 * 的 viewport 沒有（也不該為此加）`maximum-scale`——那會一併關掉使用者主動縮放（a11y）。
 * `globals.css` 雖有 `input, textarea, select { font-size: 16px }` 保底，但元件 scoped
 * 樣式的特異度較高，一寫 14px 就把保底蓋掉；所以這裡逐檔掃 SFC 樣式。
 *
 * 判定範圍：規則 selector 的主體（最後一個 compound）是
 *   1. 元素 input／textarea／select（含 `:deep(input)` 這類包裝），或
 *   2. 同檔 template 裡直接掛在 input／textarea／select 上的 class；
 * 且該規則有宣告 font-size（或 font shorthand）。`::placeholder` 等 pseudo-element
 * 不影響聚焦放大，略過。值可為 px／rem／`var(--token[, fallback])`（依 token 檔解析）；
 * 解析不出來（inherit、em、clamp…）一律視為違規，請改寫成明確值。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const PARENT_DIR = join(ROOT, 'src/parent')
const MIN_PX = 16
/**
 * 家長端根字級 = 16px × --ivy-font-scale（字級設定，見 globals.css 的 html 規則）。
 * rem 要用「最小」倍率換算：家長把字級調小時 1rem 會低於 16px，照樣觸發 iOS 聚焦放大，
 * 所以輸入欄位要寫 max(16px, Nrem)。
 */
const ROOT_FONT_PX = 16 * minFontScale()

function minFontScale(): number {
  const css = readFileSync(join(ROOT, 'src/assets/a11y.css'), 'utf-8')
  const scales = [...css.matchAll(/html\.ivy-size-[\w-]+\s*\{\s*--ivy-font-scale:\s*([\d.]+)/g)].map((m) => Number(m[1]))
  return scales.length ? Math.min(1, ...scales) : 1
}
const TOKEN_FILES = [
  'src/assets/design-tokens.css',
  'src/parent/styles/m3-tokens.css',
  'src/parent/styles/typography.css',
  'src/parent/styles/globals.css',
]
/** 這些 type 聚焦不會叫出鍵盤／不觸發放大，掛在其上的 class 不納入判定。 */
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'file', 'hidden', 'range', 'color'])

function listVueFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue
      out.push(...listVueFiles(full))
    } else if (name.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

function buildTokenMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const file of TOKEN_FILES) {
    const css = readFileSync(join(ROOT, file), 'utf-8')
    const root = postcss.parse(css)
    root.walkDecls((decl) => {
      // 只取第一個定義（light / :root），dark/高對比覆寫不改尺寸
      if (decl.prop.startsWith('--') && !map.has(decl.prop)) map.set(decl.prop, decl.value.trim())
    })
  }
  return map
}

const TOKENS = buildTokenMap()

/** 解析 font-size 值為 px；解析不出回 null。 */
function toPx(raw: string, depth = 0): number | null {
  const value = raw.replace(/!important/, '').trim()
  if (depth > 5) return null
  const varMatch = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value)
  if (varMatch) {
    const token = TOKENS.get(varMatch[1])
    if (token !== undefined) {
      const resolved = toPx(token, depth + 1)
      // --text-* 在 a11y.css 會乘上 --ivy-font-scale，調小字級時一樣會低於 16px
      return resolved !== null && varMatch[1].startsWith('--text-') ? resolved * minFontScale() : resolved
    }
    return varMatch[2] ? toPx(varMatch[2], depth + 1) : null
  }
  const maxMatch = /^max\((.+)\)$/.exec(value)
  if (maxMatch) {
    const parts = maxMatch[1].split(',').map((part) => toPx(part, depth + 1))
    return parts.some((n) => n !== null) ? Math.max(...parts.map((n) => n ?? 0)) : null
  }
  const px = /^(\d+(?:\.\d+)?)px$/.exec(value)
  if (px) return Number(px[1])
  const rem = /^(\d+(?:\.\d+)?)rem$/.exec(value)
  if (rem) return Number(rem[1]) * ROOT_FONT_PX
  return null
}

/** font shorthand 取出字級片段（`600 14px/1.4 inherit` → `14px`）。 */
function sizeFromShorthand(value: string): string {
  const m = /(var\([^)]*\)|\d+(?:\.\d+)?(?:px|rem|em|%))(?:\s*\/[^\s]+)?/.exec(value)
  return m ? m[1] : value
}

/** 從 template 收集直接掛在文字型 input／textarea／select 上的靜態 class。 */
function inputClasses(template: string): Set<string> {
  const classes = new Set<string>()
  const tagRe = /<(input|textarea|select)\b([^>]*)>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(template))) {
    const attrs = m[2]
    const type = /\stype="([^"]+)"/.exec(attrs)?.[1]
    if (m[1] === 'input' && type && NON_TEXT_INPUT_TYPES.has(type)) continue
    const cls = /\sclass="([^"]+)"/.exec(attrs)?.[1]
    if (cls) for (const c of cls.split(/\s+/)) if (c) classes.add(c)
  }
  return classes
}

/** 取 selector 片段的主體 compound（最後一個組合子之後）。 */
function subjectCompound(selector: string): string {
  // 先把 :deep(...) / :global(...) 拆開，避免括號內空白被當成組合子
  const flat = selector.replace(/:(deep|global|slotted)\(([^)]*)\)/g, ' $2')
  const parts = flat.trim().split(/\s*[\s>+~]\s*/)
  return parts[parts.length - 1] ?? ''
}

function targetsInput(compound: string, classes: Set<string>): boolean {
  if (compound.includes('::')) return false
  if (/(^|[^\w-])(input|textarea|select)(?![\w-])/.test(compound.replace(/\.[\w-]+/g, ''))) return true
  const used = compound.match(/\.[\w-]+/g) ?? []
  return used.some((c) => classes.has(c.slice(1)))
}

interface Violation {
  file: string
  selector: string
  value: string
}

function collectViolations(): Violation[] {
  const violations: Violation[] = []
  for (const file of listVueFiles(PARENT_DIR)) {
    const sfc = readFileSync(file, 'utf-8')
    const template = /<template>([\s\S]*)<\/template>/.exec(sfc)?.[1] ?? ''
    const classes = inputClasses(template)
    const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/g
    let m: RegExpExecArray | null
    while ((m = styleRe.exec(sfc))) {
      postcss.parse(m[1]).walkRules((rule) => {
        const sizes: string[] = []
        rule.each((node) => {
          if (node.type !== 'decl') return
          if (node.prop === 'font-size') sizes.push(node.value)
          else if (node.prop === 'font') sizes.push(sizeFromShorthand(node.value))
        })
        if (!sizes.length) return
        const hits = rule.selectors.filter((s) => targetsInput(subjectCompound(s), classes))
        if (!hits.length) return
        for (const size of sizes) {
          const px = toPx(size)
          if (px === null || px < MIN_PX) {
            violations.push({ file: relative(ROOT, file), selector: hits.join(', '), value: size })
          }
        }
      })
    }
  }
  return violations
}

describe('家長端輸入欄位字級 ≥ 16px（防 iOS / LIFF 聚焦放大）', () => {
  it('token 解析可用（--text-lg = 16px、--text-base = 14px）', () => {
    // rem 與 --text-* 都會跟字級設定縮放，以最小倍率（sm）換算
    const minScale = minFontScale()
    expect(minScale).toBeLessThan(1)
    expect(toPx('var(--text-lg)')).toBeCloseTo(16 * minScale)
    expect(toPx('var(--text-base, 99px)')).toBeCloseTo(14 * minScale)
    expect(toPx('1rem')).toBeCloseTo(16 * minScale)
    expect(toPx('max(16px, 1rem)')).toBe(16)
    expect(toPx('max(16px, var(--text-lg))')).toBe(16)
    expect(toPx('inherit')).toBeNull()
  })

  it('主體判定：元素、:deep 包裝、template 上的 class；略過 placeholder', () => {
    const cls = new Set(['note-input'])
    expect(targetsInput(subjectCompound('.field input'), cls)).toBe(true)
    expect(targetsInput(subjectCompound('.wrap :deep(textarea)'), cls)).toBe(true)
    expect(targetsInput(subjectCompound('.form .note-input'), cls)).toBe(true)
    expect(targetsInput(subjectCompound('.field input::placeholder'), cls)).toBe(false)
    expect(targetsInput(subjectCompound('.field label'), cls)).toBe(false)
    expect(targetsInput(subjectCompound('.selected-chip'), cls)).toBe(false)
    expect(inputClasses('<input type="checkbox" class="cb" /><textarea class="t" />')).toEqual(
      new Set(['t']),
    )
  })

  it('src/parent/**/*.vue 沒有任何輸入欄位規則的字級 < 16px', () => {
    const violations = collectViolations()
    expect(
      violations.map((v) => `${v.file} :: ${v.selector} => ${v.value}`),
    ).toEqual([])
  })
})
