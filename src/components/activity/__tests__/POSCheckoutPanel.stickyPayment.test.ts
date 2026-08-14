import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 依學生收款時左側清單可以很長（一個班就數十筆）。原本 body 是
 * `align-items: stretch` 的雙欄 grid，右側付款欄被長清單拉到同高，而付款卡的
 * 按鈕組是 `margin-top: auto`——三者疊加的結果是：收銀員勾完一筆，要一路捲到
 * 整份清單的最底才看得到「確認收款並列印」。每收一筆都得來回捲一次。
 *
 * 修法是把付款欄改成 sticky（沿用 YearPlanWorkspaceView `.side-panel` 的既有
 * 慣例）。這條測試是那個決定的柵欄——sticky 失效不會有任何錯誤訊息，只會靜悄悄
 * 地退回「捲到底才能結帳」。
 */
const panelSource = readFileSync(
  resolve(__dirname, '../POSCheckoutPanel.vue'),
  'utf-8'
)

function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`找不到 CSS 規則 ${selector}`)
  return match[1]
}

describe('POS 付款面板 sticky（長清單時仍看得到結帳按鈕）', () => {
  it('付款欄是 sticky，且吸附位置留了間距', () => {
    const body = ruleBody(panelSource, '.pos-panel-wrap__col--pay')
    expect(body).toMatch(/position:\s*sticky/)
    expect(body).toMatch(/top:/)
  })

  it('付款欄自身可內捲，面板比視窗高時不會把按鈕頂出畫面', () => {
    const body = ruleBody(panelSource, '.pos-panel-wrap__col--pay')
    expect(body).toMatch(/max-height:/)
    expect(body).toMatch(/overflow-y:\s*auto/)
  })

  it('grid 不再 stretch——否則付款欄會被長清單拉到同高，sticky 也沒有可吸附的空間', () => {
    const body = ruleBody(panelSource, '.pos-panel-wrap__body')
    expect(body).not.toMatch(/align-items:\s*stretch/)
    expect(body).toMatch(/align-items:\s*start/)
  })

  it('付款欄不吃通用欄位的 min-height（會把空狀態撐成一大片白）', () => {
    // 通用 .pos-panel-wrap__col 仍為左側長清單保留最小高度
    expect(ruleBody(panelSource, '.pos-panel-wrap__col')).toMatch(/min-height/)
    // 付款欄必須覆蓋掉它
    expect(ruleBody(panelSource, '.pos-panel-wrap__col--pay')).toMatch(
      /min-height:\s*0/
    )
  })

  it('容器沒有 overflow——祖先一旦成為 scroll container，底下 sticky 全部失效', () => {
    expect(ruleBody(panelSource, '.pos-panel-wrap')).not.toMatch(/overflow/)
    expect(ruleBody(panelSource, '.pos-panel-wrap__body')).not.toMatch(/overflow/)
    // 外層頁面殼同理：真正該當 scroll container 的是 AdminLayout 的 .el-main
    const viewSource = readFileSync(
      resolve(__dirname, '../../../views/activity/POSView.vue'),
      'utf-8'
    )
    expect(ruleBody(viewSource, '.pos-view')).not.toMatch(/overflow/)
  })

  it('窄螢幕單欄時關閉 sticky，避免付款卡蓋住底下的清單', () => {
    const narrow = panelSource.match(
      /@media\s*\(max-width:\s*1000px\)\s*\{([\s\S]*?)\n\}/
    )
    expect(narrow, '找不到 max-width: 1000px 的 media query').toBeTruthy()
    expect(narrow![1]).toMatch(
      /\.pos-panel-wrap__col--pay\s*\{[^}]*position:\s*static/
    )
  })

  it('付款欄在 template 上真的掛了 --pay class（CSS 寫了但沒套等於沒改）', () => {
    const paymentTag = panelSource.match(/<POSPaymentPanel[\s\S]*?\/>/)
    expect(paymentTag, '找不到 POSPaymentPanel').toBeTruthy()
    expect(paymentTag![0]).toMatch(/pos-panel-wrap__col--pay/)
  })
})
