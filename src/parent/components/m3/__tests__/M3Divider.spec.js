import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Divider from '../M3Divider.vue'

describe('M3Divider', () => {
  it('預設 render hr role=separator', () => {
    const w = mount(M3Divider)
    expect(w.element.tagName).toBe('HR')
    expect(w.attributes('role')).toBe('separator')
    expect(w.classes()).toContain('m3-divider')
  })

  it('inset prop 套 inset class', () => {
    const w = mount(M3Divider, { props: { inset: true } })
    expect(w.classes()).toContain('is-inset')
  })

  it('vertical prop 套 vertical class + aria-orientation', () => {
    const w = mount(M3Divider, { props: { vertical: true } })
    expect(w.classes()).toContain('is-vertical')
    expect(w.attributes('aria-orientation')).toBe('vertical')
  })
})
