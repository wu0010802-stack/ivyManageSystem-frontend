import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

describe('KawaiiStar', () => {
  it('預設 size=24，render svg', () => {
    const w = mount(KawaiiStar)
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('width')).toBe('24')
    expect(svg.attributes('height')).toBe('24')
  })

  it('size prop 控制 svg 大小', () => {
    const w = mount(KawaiiStar, { props: { size: 48 } })
    expect(w.find('svg').attributes('width')).toBe('48')
  })

  it('預設 aria-label="星星徽章"，role="img"', () => {
    const w = mount(KawaiiStar)
    const svg = w.find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('星星徽章')
  })

  it('decorative=true 改用 aria-hidden 而非 label', () => {
    const w = mount(KawaiiStar, { props: { decorative: true } })
    const svg = w.find('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('aria-label')).toBeUndefined()
  })

  it('expression=wink 套用 wink 表情 path（不同 d 屬性）', () => {
    const w1 = mount(KawaiiStar, { props: { expression: 'smile' } })
    const w2 = mount(KawaiiStar, { props: { expression: 'wink' } })
    const smileMouth = w1.find('[data-test="mouth"]').attributes('d')
    const winkMouth = w2.find('[data-test="mouth"]').attributes('d')
    expect(smileMouth).not.toBe(winkMouth)
  })

  it('expression=sleep 套用 sleep 嘴 path 且左眼仍為點', () => {
    const w = mount(KawaiiStar, { props: { expression: 'sleep' } })
    expect(w.find('[data-test="mouth"]').attributes('d')).toBe('M27 36 L33 36')
    // sleep 與 smile 一樣：左眼是 circle（不是 wink 那條線）
    expect(w.findAll('circle').length).toBeGreaterThanOrEqual(2)
  })
})
