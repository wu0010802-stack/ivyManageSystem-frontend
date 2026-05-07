import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LaurelWreath from '@/parent/components/brand/LaurelWreath.vue'

describe('LaurelWreath', () => {
  it('預設 side=full 渲染兩側葉子', () => {
    const w = mount(LaurelWreath)
    expect(w.find('[data-test="laurel-left"]').exists()).toBe(true)
    expect(w.find('[data-test="laurel-right"]').exists()).toBe(true)
  })

  it('side=left 只渲染左邊', () => {
    const w = mount(LaurelWreath, { props: { side: 'left' } })
    expect(w.find('[data-test="laurel-left"]').exists()).toBe(true)
    expect(w.find('[data-test="laurel-right"]').exists()).toBe(false)
  })

  it('side=right 只渲染右邊', () => {
    const w = mount(LaurelWreath, { props: { side: 'right' } })
    expect(w.find('[data-test="laurel-left"]').exists()).toBe(false)
    expect(w.find('[data-test="laurel-right"]').exists()).toBe(true)
  })

  it('預設 opacity=0.18，可被 prop 覆蓋', () => {
    const w1 = mount(LaurelWreath)
    expect(w1.find('svg').attributes('style') || '').toContain('opacity: 0.18')
    const w2 = mount(LaurelWreath, { props: { opacity: 0.5 } })
    expect(w2.find('svg').attributes('style') || '').toContain('opacity: 0.5')
  })

  it('預設 aria-hidden（裝飾性）', () => {
    const w = mount(LaurelWreath)
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
  })
})
