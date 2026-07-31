import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * `.page-wrapper { overflow: hidden }` 會讓它變成 scroll container，底下所有
 * position: sticky 從此永遠吸不住。截止倒數提示與桌機結帳列都曾整段失效，而且
 * 不會有任何錯誤訊息——設計意圖只留在註解裡，沒有人發現它沒作用。
 *
 * 這條測試是那個 bug 的柵欄：只要有人為了裁切圓角把 overflow 加回去就會紅。
 */
const source = readFileSync(resolve(__dirname, '../ActivityPublicView.vue'), 'utf-8')

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`ActivityPublicView.vue 找不到規則 ${selector}`)
  return match[1]
}

describe('.page-wrapper 不可再有 overflow（會廢掉全頁 sticky）', () => {
  it('.page-wrapper 沒有宣告 overflow', () => {
    expect(ruleBody('.page-wrapper')).not.toMatch(/overflow/)
  })

  it('圓角裁切改由 .page-header 自帶上方圓角處理', () => {
    expect(ruleBody('.page-header')).toMatch(/border-radius/)
  })

  it('兩處 sticky 仍在（移除它們等於默默拿掉設計意圖）', () => {
    expect(ruleBody('.notice.is-sticky')).toMatch(/position:\s*sticky/)
    expect(source).toMatch(/\.checkout-stick\s*\{[^}]*position:\s*sticky/)
  })
})
