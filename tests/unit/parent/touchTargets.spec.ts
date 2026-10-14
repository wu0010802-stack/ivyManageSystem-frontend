import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 家長端觸控目標守衛（使用者含祖父母，PRODUCT.md：家長端觸控目標放大）。
 *
 * M3 元件視覺尺寸照規格（按鈕 40px、chip 32px），命中區用透明 ::after 撐到
 * --touch-target-m3（48px）；pattern 按鈕對齊 --touch-target-min（44px）。
 * jsdom 不算 layout，這裡鎖的是 CSS 契約本身。
 */
const root = resolve(__dirname, '../../../src/parent')
const read = (rel: string): string => readFileSync(resolve(root, rel), 'utf-8')
/** 去註解並壓平空白，讓規則可用單行 regex 比對（註解裡提到的屬性不算數） */
const flat = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')

describe('M3 元件命中區 ≥48px', () => {
  it('globals.css 定義 --touch-target-m3: 48px', () => {
    expect(read('styles/globals.css')).toMatch(/--touch-target-m3:\s*48px/)
  })

  it.each([
    ['m3/M3Button.vue', '.m3-button'],
    ['m3/M3IconButton.vue', '.m3-icon-button'],
    ['m3/M3Chip.vue', '.m3-chip'],
    ['m3/M3SegmentedButton.vue', '.m3-segment'],
  ])('%s 以 ::after 擴張命中區', (file, sel) => {
    const css = flat(read(`components/${file}`))
    const escaped = sel.replace('.', '\\.')
    const rule = css.match(new RegExp(`${escaped}::after \\{([^}]*)\\}`))
    expect(rule, `${sel}::after 不存在`).not.toBeNull()
    expect(rule![1]).toContain("content: ''")
    expect(rule![1]).toContain('position: absolute')
    expect(rule![1]).toMatch(/height: max\(100%, var\(--touch-target-m3, 48px\)\)/)
    // 偽元素要能接住點擊：不得 pointer-events:none
    expect(rule![1]).not.toContain('pointer-events: none')
    // 本體需是定位容器，命中區才會以它為中心
    expect(css).toMatch(new RegExp(`${escaped} \\{[^}]*position: relative`))
  })

  it('segmented button 容器不得 overflow:hidden（會把 segment 命中區裁掉）', () => {
    const css = flat(read('components/m3/M3SegmentedButton.vue'))
    const container = css.match(/\.m3-segmented-button \{([^}]*)\}/)
    expect(container![1]).not.toMatch(/overflow:\s*hidden/)
  })

  it('chip 的移除鈕疊在命中區之上，點移除不會變成點整顆 chip', () => {
    const css = flat(read('components/m3/M3Chip.vue'))
    expect(css).toMatch(/\.m3-chip-remove \{[^}]*position: relative;[^}]*z-index: 1/)
  })
})

describe('patterns.css 按鈕觸控目標', () => {
  const css = flat(read('styles/patterns.css'))

  it.each(['.pt-action-btn', '.pt-ghost-btn'])('%s min-height 對齊 --touch-target-min', (sel) => {
    const rule = css.match(new RegExp(`${sel.replace('.', '\\.')} \\{([^}]*)\\}`))
    expect(rule![1]).toMatch(/min-height: var\(--touch-target-min, 44px\)/)
  })

  it('.pt-icon-btn 視覺 40px 不變、::after 命中區撐到 --touch-target-min', () => {
    expect(css).toMatch(/\.pt-icon-btn \{[^}]*position: relative[^}]*width: 40px/)
    expect(css).toMatch(/\.pt-icon-btn::after \{[^}]*height: max\(100%, var\(--touch-target-min, 44px\)\)/)
  })
})

describe('ParentBottomSheet 把手', () => {
  const sfc = read('components/ParentBottomSheet.vue')

  it('role=button 的把手必須同時有 keydown（不能只有 role 沒有鍵盤操作）', () => {
    const tags = sfc.match(/<div[^>]*class="pt-bsheet-handle"[^>]*>/gs) ?? []
    expect(tags.length).toBeGreaterThan(0)
    for (const tag of tags) {
      if (tag.includes('role="button"')) expect(tag).toMatch(/@keydown=/)
      else expect(tag).toContain('aria-hidden="true"')
    }
  })

  it('把手橫條用 ≥3:1 的 --m3-outline，命中區撐到 --touch-target-min', () => {
    const css = flat(sfc)
    expect(css).toMatch(/\.pt-bsheet-handle::before \{[^}]*background: var\(--m3-outline,/)
    expect(css).toMatch(/\.pt-bsheet-handle::after \{[^}]*height: var\(--touch-target-min, 44px\)/)
    expect(css).not.toMatch(/\.pt-bsheet-handle \{[^}]*--pt-surface-mute/)
  })
})
