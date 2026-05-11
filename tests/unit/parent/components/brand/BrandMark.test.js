import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandMark from '@/components/brand/BrandMark.vue'

describe('BrandMark', () => {
  it('預設 variant=mini, size=32', () => {
    const w = mount(BrandMark)
    expect(w.find('[data-test="brand-mark"]').attributes('style') || '').toContain('width: 32px')
  })

  it('mini 模式不顯示文字 ribbon', () => {
    const w = mount(BrandMark, { props: { variant: 'mini' } })
    expect(w.findComponent({ name: 'IvyRibbon' }).exists()).toBe(false)
  })

  it('full 模式顯示 IVY KIDS 文字 ribbon', () => {
    const w = mount(BrandMark, { props: { variant: 'full' } })
    const ribbon = w.findComponent({ name: 'IvyRibbon' })
    expect(ribbon.exists()).toBe(true)
    expect(ribbon.text()).toContain('IVY KIDS')
  })

  it('mark-only 不顯示 ribbon 但有 LaurelWreath + Crown', () => {
    const w = mount(BrandMark, { props: { variant: 'mark-only' } })
    expect(w.findComponent({ name: 'IvyRibbon' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'LaurelWreath' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'CrownIcon' }).exists()).toBe(true)
  })

  it('aria-label=常春藤幼兒園', () => {
    const w = mount(BrandMark)
    expect(w.find('[data-test="brand-mark"]').attributes('aria-label')).toBe('常春藤幼兒園')
  })

  it('size prop 透過 --mark-size CSS var 傳給內層 ribbon font-size', () => {
    const w = mount(BrandMark, { props: { variant: 'full', size: 100 } })
    const root = w.find('[data-test="brand-mark"]')
    expect(root.attributes('style') || '').toContain('--mark-size: 100px')
  })
})
