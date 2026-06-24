import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusPill from '../StatusPill.vue'

describe('StatusPill', () => {
  it('render label', () => {
    const w = mount(StatusPill, { props: { label: '已繳' } })
    expect(w.text()).toContain('已繳')
  })

  it('預設 tone = neutral', () => {
    const w = mount(StatusPill, { props: { label: 'x' } })
    expect(w.classes()).toContain('status-pill')
    expect(w.classes()).toContain('tone-neutral')
  })

  it.each(['ok', 'warn', 'danger', 'neutral', 'info'])('tone=%s 套對應 class', (tone) => {
    const w = mount(StatusPill, { props: { label: 'x', tone } })
    expect(w.classes()).toContain(`tone-${tone}`)
  })

  it('icon prop 渲染 leading Material Symbol（aria-hidden）', () => {
    const w = mount(StatusPill, { props: { label: 'x', icon: 'check' } })
    const leading = w.find('.status-pill-icon')
    expect(leading.exists()).toBe(true)
    expect(leading.text()).toBe('check')
    expect(leading.attributes('aria-hidden')).toBe('true')
  })
})
