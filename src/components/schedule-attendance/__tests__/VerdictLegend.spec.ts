import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import VerdictLegend from '../VerdictLegend.vue'
import { VERDICT_KIND_LABELS, type VerdictKind } from '@/utils/scheduleAttendanceGrid'

const ORDER: VerdictKind[] = ['deduct', 'missing', 'confirm', 'setting', 'pending_data']

describe('VerdictLegend 圖例', () => {
  it('依序列出五類判定，每項＝形狀＋文字（文字取自 VERDICT_KIND_LABELS）', () => {
    const wrapper = mount(VerdictLegend)
    const items = wrapper.findAll('[data-test^="verdict-legend-"]')
    expect(items.map((item) => item.attributes('data-test'))).toEqual(ORDER.map((kind) => `verdict-legend-${kind}`))
    ORDER.forEach((kind, i) => {
      expect(items[i].text()).toBe(VERDICT_KIND_LABELS[kind])
      const shape = items[i].get('.verdict-shape')
      expect(shape.classes()).toContain(`verdict-shape--${kind}`)
      // 形狀是裝飾：文字已說明，不讓報讀重複念
      expect(shape.attributes('aria-hidden')).toBe('true')
    })
    expect(wrapper.text()).not.toContain('請假')
  })

  it('showLeave：最後多一項「請假」（實心小方塊）', () => {
    const wrapper = mount(VerdictLegend, { props: { showLeave: true } })
    const items = wrapper.findAll('[data-test^="verdict-legend-"]')
    expect(items).toHaveLength(6)
    expect(items[5].attributes('data-test')).toBe('verdict-legend-leave')
    expect(items[5].text()).toBe('請假')
    expect(items[5].get('.verdict-shape').classes()).toContain('verdict-shape--leave')
  })

  it('圖例是一個有名稱的清單，報讀才知道這組是什麼', () => {
    const wrapper = mount(VerdictLegend)
    expect(wrapper.get('ul').attributes('aria-label')).toBe('圖例')
    expect(wrapper.findAll('li')).toHaveLength(5)
  })
})
