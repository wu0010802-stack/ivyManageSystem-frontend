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
