import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 稽核 P2-12 / P3-10（2026-08-14）：POS 兩支面板在深色模式下大面積失效。
 *
 * - P2-12：學生分組表頭底色寫死 `#eef0fd`（淺藍紫），深色模式下文字（--text-primary
 *   已翻成近白）疊在淺底上等於隱形——那塊正是櫃台辨識收款對象的主要區塊。
 * - P3-10：金額與警示文字色用 `--color-*-hover`。那組 token 的語意是「互動態深一階」，
 *   a11y.css 的 html.dark 刻意沒有翻（因為站上有多處把它當背景／邊框用，翻了會壞），
 *   於是深色下維持 light 深色值疊在深底，實測僅 2.5–3.6:1。其中包含最關鍵的
 *   「資料截斷可能漏算」警告。高對比文字色應走 `--color-*-darker`（該組 a11y.css
 *   已為 dark 翻成亮階）。
 *
 * 這兩類缺陷在單元測試裡看不到（scoped CSS 不參與 jsdom 計算），所以用原始碼柵欄
 * 釘住：只要有人把寫死 hex 或 `*-hover` 文字色寫回來就紅。
 */

const searchPanelSource = readFileSync(
  resolve(__dirname, '../POSSearchPanel.vue'),
  'utf-8'
)
const reconciliationSource = readFileSync(
  resolve(__dirname, '../POSSemesterReconciliation.vue'),
  'utf-8'
)
const paymentPanelSource = readFileSync(
  resolve(__dirname, '../POSPaymentPanel.vue'),
  'utf-8'
)
const checkoutPanelSource = readFileSync(
  resolve(__dirname, '../POSCheckoutPanel.vue'),
  'utf-8'
)
const closeHistorySource = readFileSync(
  resolve(__dirname, '../POSCloseHistoryPanel.vue'),
  'utf-8'
)
const approvalViewSource = readFileSync(
  resolve(__dirname, '../../../views/activity/POSApprovalView.vue'),
  'utf-8'
)

function styleBlock(source: string): string {
  const match = source.match(/<style[^>]*>([\s\S]*)<\/style>/)
  if (!match) throw new Error('找不到 <style> 區塊')
  return match[1]
}

function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`找不到 CSS 規則 ${selector}`)
  return match[1]
}

describe('POSSearchPanel 深色模式對比（P2-12 / P3-10）', () => {
  it('學生分組表頭底色走 token，不寫死淺色 hex', () => {
    const body = ruleBody(searchPanelSource, '.pos-group__head')

    expect(body).toMatch(/background:\s*var\(--brand-primary-soft/)
  })

  it('樣式區塊不再出現寫死的深色文字 hex #0284c7（深色模式未翻）', () => {
    expect(styleBlock(searchPanelSource)).not.toMatch(/#0284c7/i)
  })

  it('金額與強調文字改用 *-darker（dark 已翻亮階），不用互動態 *-hover', () => {
    const style = styleBlock(searchPanelSource)

    expect(style).not.toMatch(/color:\s*var\(--color-(success|warning|danger|info)-hover/)
  })

  it('待收／待退合計數字用高對比 token', () => {
    const body = ruleBody(searchPanelSource, '.pos-panel__summary-total strong')

    expect(body).toMatch(/color:\s*var\(--color-danger-darker\)/)
  })
})

describe('POSSemesterReconciliation 深色模式對比（P3-10）', () => {
  it('截斷警告（漏算風險）用高對比 token，不用 *-hover', () => {
    const body = ruleBody(reconciliationSource, '.pos-semester__trunc-warn')

    expect(body).toMatch(/color:\s*var\(--color-danger-darker/)
  })

  it('部分合計提示用高對比 token', () => {
    const body = ruleBody(reconciliationSource, '.pos-semester__stats-caption')

    expect(body).toMatch(/color:\s*var\(--color-warning-darker/)
  })

  it('展開列的金額強調色全部改用 *-darker', () => {
    const style = styleBlock(reconciliationSource)

    expect(style).not.toMatch(/color:\s*var\(--color-(success|warning|danger|info)-hover/)
  })

  it('hint 區塊與 code 底色走 neutral token，不寫死淺色 hex', () => {
    const hint = ruleBody(reconciliationSource, '.pos-semester__hint')
    const code = ruleBody(reconciliationSource, '.pos-semester__hint code')

    expect(hint).not.toMatch(/#[0-9a-f]{3,6}/i)
    expect(code).not.toMatch(/#[0-9a-f]{3,6}/i)
  })
})

/**
 * P3-10 跨檔剩餘部分（2026-08-14）：同一組「把互動態 token 當文字色」的缺陷還散在
 * 另外四支 POS 檔案裡。判準與上面兩支相同——只針對 `color:` 宣告（背景／邊框用
 * `*-hover` 是刻意的，不在此列），一律改走 `*-darker`。
 */
describe('POS 其餘面板深色模式文字對比（P3-10 跨檔）', () => {
  const targets: { name: string; source: string }[] = [
    { name: 'POSPaymentPanel', source: paymentPanelSource },
    { name: 'POSCheckoutPanel', source: checkoutPanelSource },
    { name: 'POSCloseHistoryPanel', source: closeHistorySource },
    { name: 'POSApprovalView', source: approvalViewSource },
  ]

  it.each(targets)('$name 的文字色不使用互動態 *-hover token', ({ source }) => {
    expect(styleBlock(source)).not.toMatch(
      /color:\s*var\(--color-(success|warning|danger|info)-hover/
    )
  })

  it('POSPaymentPanel 退費金額與輸入框文字用 *-darker', () => {
    expect(ruleBody(paymentPanelSource, '.pos-payment__amount--refund')).toMatch(
      /color:\s*var\(--color-danger-darker\)/
    )
    expect(
      ruleBody(paymentPanelSource, '.pos-payment__applied-input--refund :deep(input)')
    ).toMatch(/color:\s*var\(--color-danger-darker\)/)
  })

  it('POSCheckoutPanel 找零金額用 *-darker（保留 !important 覆寫層級）', () => {
    const body = ruleBody(checkoutPanelSource, '.pos-panel-wrap__change')

    expect(body).toMatch(/color:\s*var\(--color-success-darker\)\s*!important/)
  })

  it('POSCloseHistoryPanel 差異列強調字用 *-darker', () => {
    expect(
      ruleBody(closeHistorySource, '.pos-approval__info-row--danger strong')
    ).toMatch(/color:\s*var\(--color-danger-darker\)/)
  })

  it('POSApprovalView 三處警示文字（差異列／危險提示／盤點差額）皆用 *-darker', () => {
    for (const selector of [
      '.pos-approval__info-row--danger strong',
      '.pos-approval__hint--danger',
      '.pos-approval__variance',
    ]) {
      expect(ruleBody(approvalViewSource, selector)).toMatch(
        /color:\s*var\(--color-danger-darker\)/
      )
    }
  })
})
