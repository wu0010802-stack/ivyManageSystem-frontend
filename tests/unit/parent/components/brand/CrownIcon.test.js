import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CrownIcon from '@/components/brand/CrownIcon.vue'

describe('CrownIcon', () => {
  it('預設 size=20、variant=gold、aria-label=皇冠', () => {
    const w = mount(CrownIcon)
    const svg = w.find('svg')
    expect(svg.attributes('width')).toBe('20')
    expect(svg.attributes('aria-label')).toBe('皇冠')
    // 主色為金黃
    expect(w.find('[data-test="crown-body"]').attributes('fill')).toContain('var(--ivy-star-yellow')
  })

  it('variant=silver 改用銀色 fill', () => {
    const w = mount(CrownIcon, { props: { variant: 'silver' } })
    const fill = w.find('[data-test="crown-body"]').attributes('fill')
    expect(fill).toContain('#d0d0d0')
  })

  it('decorative=true 用 aria-hidden', () => {
    const w = mount(CrownIcon, { props: { decorative: true } })
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
  })
})
