import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// css 的 `?raw` 在 vitest 下回空字串，一律用 fs 直接讀原始檔
const read = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf8')
const layoutSrc = read('layouts/PortalLayout.vue')
const sheetSrc = read('components/portal/TeacherBottomSheet.vue')
const paletteSrc = read('components/portal/PortalSearchPalette.vue')
const tokensSrc = read('assets/design-tokens.css')

/**
 * 擋整類守衛（2026-10-12 P0）：教師端的覆蓋層一律要蓋在手機底部導覽之上。
 *
 * 底部導覽 `.bottom-nav` 原本寫死 `z-index: 1000`，而 `TeacherBottomSheet` 的遮罩是
 * `var(--z-modal-backdrop)`＝90。結果請假／加班／補打卡／換班四張表單在手機上，
 * 「取消／送出申請」那一列永遠被導覽列蓋住，捲到底也點不到；點下去實際點到的是
 * 底部分頁（staging 以 elementFromPoint 實測命中 `.bottom-tab`）。
 *
 * 這類問題型別檢查與元件測試都看不出來（happy-dom 不算版面），只能比對宣告的層級。
 * 本測試從原始碼讀出各覆蓋層的 z-index（`var(--x, fallback)` 依 design-tokens 解析），
 * 斷言全部高於底部導覽。新增手機覆蓋層時把它補進 OVERLAYS。
 */

function blockOf(src: string, selector: string): string {
  // 只取「行首」的選擇器區塊，避免把註解或 @media 內的覆寫當成主宣告
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(src)
  if (!m) throw new Error(`找不到 ${selector} 的樣式區塊`)
  return m[1]
}

function resolveZ(raw: string): number {
  const v = raw.trim()
  const varMatch = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(v)
  if (varMatch) {
    const token = new RegExp(`${varMatch[1]}\\s*:\\s*([^;]+);`).exec(tokensSrc)
    if (token) return resolveZ(token[1])
    if (varMatch[2]) return resolveZ(varMatch[2])
    throw new Error(`token ${varMatch[1]} 未定義且無 fallback`)
  }
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`無法解析 z-index：${raw}`)
  return n
}

function zIndexOf(src: string, selector: string): number {
  const m = /z-index\s*:\s*([^;]+);/.exec(blockOf(src, selector))
  if (!m) throw new Error(`${selector} 沒有宣告 z-index`)
  return resolveZ(m[1])
}

const OVERLAYS: Array<{ name: string; src: string; selector: string }> = [
  { name: 'TeacherBottomSheet 遮罩', src: sheetSrc, selector: '.pt-bsheet-overlay' },
  { name: '⌘K 搜尋面板', src: paletteSrc, selector: '.psp-overlay' },
]

describe('教師端覆蓋層必須蓋在手機底部導覽之上', () => {
  const navZ = zIndexOf(layoutSrc, '.bottom-nav')

  it('讀得到底部導覽的層級（守衛本身沒有空轉）', () => {
    expect(Number.isFinite(navZ)).toBe(true)
  })

  it.each(OVERLAYS)('$name 高於底部導覽', ({ src, selector }) => {
    expect(zIndexOf(src, selector)).toBeGreaterThan(navZ)
  })
})
