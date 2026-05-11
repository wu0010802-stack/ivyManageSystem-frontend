import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BalloonGroup from '@/components/brand/BalloonGroup.vue'

describe('BalloonGroup', () => {
  it('預設 count=3', () => {
    const w = mount(BalloonGroup)
    expect(w.findAll('[data-test="balloon"]')).toHaveLength(3)
  })

  it('count=5 渲染 5 顆', () => {
    const w = mount(BalloonGroup, { props: { count: 5 } })
    expect(w.findAll('[data-test="balloon"]')).toHaveLength(5)
  })

  it('預設色彩用童彩 6 色循環', () => {
    const w = mount(BalloonGroup, { props: { count: 3 } })
    const fills = w.findAll('[data-test="balloon"] ellipse').map(e => e.attributes('fill'))
    // 至少 3 個不同顏色
    const unique = new Set(fills)
    expect(unique.size).toBeGreaterThanOrEqual(3)
  })

  it('colors prop 可覆蓋', () => {
    const w = mount(BalloonGroup, {
      props: { count: 2, colors: ['#ff0000', '#00ff00'] },
    })
    const fills = w.findAll('[data-test="balloon"] ellipse').map(e => e.attributes('fill'))
    expect(fills).toEqual(['#ff0000', '#00ff00'])
  })

  it('aria-hidden=true（純裝飾）', () => {
    const w = mount(BalloonGroup)
    expect(w.find('svg').attributes('aria-hidden')).toBe('true')
  })

  it('viewBox 隨 count 動態調整避免裁切', () => {
    const w1 = mount(BalloonGroup, { props: { count: 3 } })
    expect(w1.find('svg').attributes('viewBox')).toBe('0 0 120 80')
    const w2 = mount(BalloonGroup, { props: { count: 8 } })
    expect(w2.find('svg').attributes('viewBox')).toBe('0 0 320 80')
  })
})
