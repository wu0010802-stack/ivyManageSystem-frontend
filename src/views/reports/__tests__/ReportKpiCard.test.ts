import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ReportKpiCard from '../ReportKpiCard.vue'

function mountCard(props: Record<string, unknown>) {
  return mount(ReportKpiCard, {
    props: { label: '本年總收入', value: 'NT$100', ...props },
    global: { plugins: [ElementPlus] },
  })
}

describe('ReportKpiCard trend 顯示規則', () => {
  it('|delta| < 0.1 → 顯示「— 持平」灰色、無箭頭', () => {
    const w = mountCard({ trends: [{ label: 'vs 上月', delta: 0.05, test: 'mom' }] })
    const el = w.find('[data-test="mom"]')
    expect(el.text()).toContain('— 持平')
    expect(el.text()).not.toContain('↑')
    expect(el.find('.trend-flat').exists()).toBe(true)
  })
  it('上升 → ↑ +x.x%；invert=false 時上升為綠', () => {
    const w = mountCard({ trends: [{ label: 'vs 上月', delta: 12.34, test: 'mom' }] })
    const el = w.find('[data-test="mom"]')
    expect(el.text()).toContain('↑ +12.3%')
    expect(el.find('.trend-good').exists()).toBe(true)
  })
  it('invert=true（支出）時上升為紅、下降為綠', () => {
    const up = mountCard({ trends: [{ label: 'vs 上月', delta: 5, invert: true, test: 'mom' }] })
    expect(up.find('[data-test="mom"] .trend-bad').exists()).toBe(true)
    const down = mountCard({ trends: [{ label: 'vs 上月', delta: -5, invert: true, test: 'mom' }] })
    expect(down.find('[data-test="mom"] .trend-good').exists()).toBe(true)
    expect(down.find('[data-test="mom"]').text()).toContain('↓ -5.0%')
  })
  it('delta=null 且有 emptyText → 顯示替代文案；無 emptyText → 整項不渲染', () => {
    const w1 = mountCard({ trends: [{ label: 'vs 去年', delta: null, emptyText: '無去年資料', test: 'yoy' }] })
    expect(w1.find('[data-test="yoy"]').text()).toContain('無去年資料')
    const w2 = mountCard({ trends: [{ label: 'vs 上月', delta: null, test: 'mom' }] })
    expect(w2.find('[data-test="mom"]').exists()).toBe(false)
  })
  it('note 副行有給才渲染', () => {
    const w = mountCard({ note: '全年含預登錄：NT$9,408,206', noteTest: 'note' })
    expect(w.find('[data-test="note"]').text()).toContain('全年含預登錄')
    expect(mountCard({}).find('[data-test="note"]').exists()).toBe(false)
  })
})

describe('ReportKpiCard valueClass 語意色（scoped CSS 邊界）', () => {
  it('valueClass 傳入時 value div 帶上該 class', () => {
    const w = mountCard({ valueClass: 'value-orange', valueTest: 'val' })
    expect(w.find('[data-test="val"]').classes()).toContain('value-orange')
  })
  it('呼叫端使用的語意色 class 必須定義在本元件 style 內（父層 scoped 規則打不進子元件內部節點）', () => {
    // Vue scoped CSS：父元件（Overview/FinanceSummary panel）的 scope-id 只落在
    // 子元件根節點，`kpi-value` 是內部節點——父層定義的 .value-* 規則永遠打不到。
    // 因此凡是呼叫端會透過 valueClass 傳入的語意色，規則本體必須在此元件內。
    // vitest 預設不處理 <style>（css:false），無法斷言 computed style，退而斷言
    // SFC 原始碼的 style 段含該規則（斷言 selector 而非註解字串）。
    const src = readFileSync('src/views/reports/ReportKpiCard.vue', 'utf8')
    for (const cls of ['value-green', 'value-red', 'value-orange']) {
      expect(src, `缺 .kpi-value.${cls} 規則`).toMatch(new RegExp(`\\.kpi-value\\.${cls}\\s*\\{`))
    }
  })
})
