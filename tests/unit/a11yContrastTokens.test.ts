// @vitest-environment node
/**
 * 全站文字對比 token 回歸防護（2026-08-26 招生頁設計稽核）。
 *
 * 起因：staging 線上量測發現 43 組不重複的文字對比未達 WCAG AA，追根究柢是兩件事——
 *
 *  ① a11y.css 整份顏色覆寫沒有生效。main.ts 的 import 順序雖把 a11y.css 排在
 *     element-plus 之後，但 Vite build 會把 a11y.css 切進 shared-common chunk、EP 切進
 *     main chunk，產物 <link> 順序反轉成 shared-common 先載；同 specificity 下 EP 原廠
 *     :root 覆蓋回 a11y.css 的值（實測 --el-text-color-secondary 是 EP 的 #909399 而非
 *     a11y.css 宣告的 #5e6266）。修法是把選擇器提升為 html:root (0,1,1)。
 *     這種失效是靜默的——CSS 照樣 build、檔案照樣存在、沒有任何錯誤——所以必須用測試鎖住。
 *
 *  ② --text-tertiary 指向 neutral-400 #94a3b8，在 --bg-color #f8fafc 上只有 2.45:1。
 *     該 token 有 265 個消費點、--text-secondary 有 303 個，全站灰字整片不合格。
 *
 * 本檔同時鎖住「選擇器沒被改回去」與「token 值真的過得了對比計算」，後者用實際的
 * WCAG 2.1 相對亮度公式驗算，而不是比對寫死的期望 hex——這樣未來調色時只要仍過門檻
 * 就不會誤報，掉下門檻則一定會紅。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

const a11yCss = read('../../src/assets/a11y.css')
const mainCss = read('../../src/assets/main.css')
const tokensCss = read('../../src/assets/design-tokens.css')

/** WCAG 2.1 相對亮度 */
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** 從某個 CSS 檔抓 `--name: #hex;` 的字面值（不解析 var() 間接層） */
function literal(css: string, name: string): string {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`找不到 --${name} 的 hex 字面值`)
  return m[1].toLowerCase()
}

/** design-tokens.css 的 brand token 有兩份：:root 是 indigo 預設，html.ivy-admin 才是青藍 */
function adminScoped(name: string): string {
  const scope = tokensCss.slice(tokensCss.indexOf('html.ivy-admin {'))
  return literal(scope, name)
}

/** 解析 `--name: var(--other)` 的一層別名 */
function aliasOf(css: string, name: string): string {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*var\\(\\s*(--[\\w-]+)\\s*\\)`))
  if (!m) throw new Error(`--${name} 不是 var() 別名`)
  return m[1].replace('--', '')
}

// 全站兩個主要底色：白卡片與 --bg-color 頁面底
const PAPER_WHITE = '#ffffff'
const PAPER_APP = literal(tokensCss, 'neutral-50') // --bg-color 指向它
const AA_TEXT = 4.5

describe('a11y.css 的 token 覆寫必須贏過 Element Plus 原廠值', () => {
  it('選擇器是 html:root，不是裸 :root（裸 :root 會被 EP 的 main chunk 覆蓋回原廠值）', () => {
    expect(a11yCss).toMatch(/^html:root\s*\{/m)
    // 裸 :root 一旦回來，整份顏色覆寫就會靜默失效
    expect(a11yCss).not.toMatch(/^:root\s*\{/m)
  })

  it('不可改用 :root:root——那會連 html.dark 一起壓死，打掉深色模式覆寫', () => {
    // 只看行首的選擇器，檔內註解提及 :root:root 是刻意留的說明，不該誤判
    expect(a11yCss).not.toMatch(/^\s*:root:root\s*\{/m)
  })

  it('html.dark 區段仍在 html:root 之後，深色模式才蓋得過去（同為 0,1,1 特異性，靠順序決勝）', () => {
    const rootAt = a11yCss.search(/^html:root\s*\{/m)
    const darkAt = a11yCss.search(/^html\.dark\s*\{/m)
    expect(rootAt).toBeGreaterThanOrEqual(0)
    expect(darkAt).toBeGreaterThan(rootAt)
  })
})

describe('語意文字 token 的實際對比（WCAG AA 4.5:1）', () => {
  it.each([
    ['text-secondary', 303],
    ['text-tertiary', 265],
  ])('--%s 在白底與 app 底色上都達 4.5:1（約 %i 個消費點）', (name) => {
    const hex = literal(tokensCss, aliasOf(mainCss, name))
    expect(contrast(hex, PAPER_WHITE)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(contrast(hex, PAPER_APP)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('--text-tertiary 不得回到 neutral-400（#94a3b8 = 2.45:1，本次稽核的主因）', () => {
    expect(aliasOf(mainCss, 'text-tertiary')).not.toBe('neutral-400')
  })

  it('三階文字色仍維持深淺層次，沒有因為拉對比而塌成同一個值', () => {
    const l = (n: string) => luminance(literal(tokensCss, aliasOf(mainCss, n)))
    expect(l('text-primary')).toBeLessThan(l('text-secondary'))
    expect(l('text-secondary')).toBeLessThan(l('text-tertiary'))
  })
})

describe('品牌色在「需要過 4.5:1 的文字情境」有專用色階', () => {
  it('--brand-primary-strong 存在，且白字底色與白底文字兩種用法都達 AA', () => {
    const strong = adminScoped('brand-primary-strong')
    // EP 拿 --el-color-primary 同時當實心按鈕底色（配白字）與 tab/連結文字色（配白底）
    expect(contrast(PAPER_WHITE, strong)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(contrast(strong, PAPER_APP)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('--el-color-primary 指向 -strong 而非 --brand-primary（後者兩種用法分別只有 4.10 / 3.91）', () => {
    expect(mainCss).toMatch(/--el-color-primary:\s*var\(--brand-primary-strong\)/)
  })

  it('--brand-primary 本身維持原值，圖形情境（門檻 3:1）不受影響', () => {
    expect(adminScoped('brand-primary')).toBe('#0284c7')
  })
})

describe('Element Plus 文字色覆寫的實際對比', () => {
  it.each([
    ['--el-text-color-secondary'],
    ['--el-text-color-placeholder'],
  ])('%s 在白底達 AA（placeholder 舊值 #767a82 的註解宣稱 4.6:1，實測只有 4.31:1）', (varName) => {
    const m = a11yCss.match(new RegExp(`${varName}\\s*:\\s*(#[0-9a-fA-F]{6})`))
    expect(m).not.toBeNull()
    expect(contrast(m![1], PAPER_WHITE)).toBeGreaterThanOrEqual(AA_TEXT)
  })
})

describe('語意色實心按鈕的白字對比', () => {
  it.each([
    ['--el-color-success', 'success'],
    ['--el-color-danger', 'danger'],
  ])('%s 當實心底色時白字達 AA', (varName) => {
    const m = a11yCss.match(new RegExp(`${varName}\\s*:\\s*(#[0-9a-fA-F]{6})`))
    expect(m).not.toBeNull()
    expect(contrast(PAPER_WHITE, m![1])).toBeGreaterThanOrEqual(AA_TEXT)
  })
})

describe('水平溢出護欄', () => {
  it('根元素用 overflow-x: clip 而非 hidden（hidden 會使根元素成為捲動容器，讓 sticky 失效）', () => {
    expect(mainCss).toMatch(/overflow-x:\s*clip/)
    expect(mainCss).not.toMatch(/html[\s,][^{]*\{[^}]*overflow-x:\s*hidden/)
  })
})
