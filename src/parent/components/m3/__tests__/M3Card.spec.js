import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Card from '../M3Card.vue'

describe('M3Card', () => {
  it('render default slot', () => {
    const w = mount(M3Card, { slots: { default: '<p>內文</p>' } })
    expect(w.text()).toContain('內文')
  })

  it('預設 variant = elevated', () => {
    const w = mount(M3Card)
    expect(w.classes()).toContain('m3-card')
    expect(w.classes()).toContain('m3-card-elevated')
  })

  it.each(['elevated', 'filled', 'outlined'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3Card, { props: { variant } })
      expect(w.classes()).toContain(`m3-card-${variant}`)
    },
  )

  it('預設不是 clickable（無 role）', () => {
    const w = mount(M3Card)
    expect(w.attributes('role')).toBeUndefined()
    expect(w.attributes('tabindex')).toBeUndefined()
    expect(w.classes()).not.toContain('is-clickable')
  })

  it('clickable=true 加 role=button + tabindex=0 + 觸發 click', async () => {
    const w = mount(M3Card, { props: { clickable: true } })
    expect(w.attributes('role')).toBe('button')
    expect(w.attributes('tabindex')).toBe('0')
    expect(w.classes()).toContain('is-clickable')
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('padding prop 套到 style', () => {
    const w = mount(M3Card, { props: { padding: '24px' } })
    const style = w.attributes('style') || ''
    expect(style).toContain('padding: 24px')
  })
})
