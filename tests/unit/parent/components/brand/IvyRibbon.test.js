import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IvyRibbon from '@/parent/components/brand/IvyRibbon.vue'

describe('IvyRibbon', () => {
  it('渲染 default slot 內容', () => {
    const w = mount(IvyRibbon, { slots: { default: 'IVY KIDS' } })
    expect(w.text()).toContain('IVY KIDS')
  })

  it('預設 color=green 使用深綠 bg', () => {
    const w = mount(IvyRibbon, { slots: { default: 'X' } })
    const ribbon = w.find('[data-test="ribbon-bg"]')
    expect(ribbon.attributes('fill')).toContain('var(--ivy-green-deep')
  })

  it('color=teal 使用藍綠 bg', () => {
    const w = mount(IvyRibbon, { props: { color: 'teal' }, slots: { default: 'X' } })
    expect(w.find('[data-test="ribbon-bg"]').attributes('fill')).toContain('var(--ivy-teal-primary')
  })

  it('裝飾性，aria-hidden=true', () => {
    const w = mount(IvyRibbon, { slots: { default: 'X' } })
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
  })
})
