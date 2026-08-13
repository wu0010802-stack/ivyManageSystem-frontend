/**
 * BrandMark —— 正式徽章圖版（2026-08-13 使用者裁定）。
 *
 * 由 SVG 拼版（LaurelWreath+CrownIcon+IvyRibbon 的「綠 W＋皇冠」）改為渲染
 * `/LOGO.png` 徽章圖（圖內已含 IVY KIDS 緞帶字樣），舊「三層次 SVG 結構」
 * 斷言隨之退場。本檔釘住新契約：圖檔來源、alt 無障礙名稱（預設租戶機構名、
 * 可用 label 覆寫）、size prop 仍生效、variant 僅保留 API 相容不改變輸出。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandMark from '@/components/brand/BrandMark.vue'

describe('BrandMark（徽章圖版）', () => {
  it('渲染 /LOGO.png 圖檔；預設 size=32', () => {
    const w = mount(BrandMark)
    const img = w.find('img[data-test="brand-mark"]')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/LOGO.png')
    expect(img.attributes('style') || '').toContain('width: 32px')
  })

  it('alt 預設為租戶機構名（單租戶灰度 = 常春藤教育機構）', () => {
    const w = mount(BrandMark)
    expect(w.find('[data-test="brand-mark"]').attributes('alt')).toBe('常春藤教育機構')
  })

  it('label prop 覆寫 alt', () => {
    const w = mount(BrandMark, { props: { label: '測試園' } })
    expect(w.find('[data-test="brand-mark"]').attributes('alt')).toBe('測試園')
  })

  it('size prop 控制寬高', () => {
    const w = mount(BrandMark, { props: { size: 100 } })
    const style = w.find('[data-test="brand-mark"]').attributes('style') || ''
    expect(style).toContain('width: 100px')
    expect(style).toContain('height: 100px')
  })

  it('三種 variant 輸出同一張徽章圖（API 相容，無 SVG 拼版差異）', () => {
    for (const variant of ['mini', 'full', 'mark-only']) {
      const w = mount(BrandMark, { props: { variant } })
      expect(w.find('img[data-test="brand-mark"]').exists()).toBe(true)
      expect(w.findComponent({ name: 'IvyRibbon' }).exists()).toBe(false)
      expect(w.findComponent({ name: 'LaurelWreath' }).exists()).toBe(false)
    }
  })
})
