import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Switch from '../M3Switch.vue'

describe('M3Switch', () => {
  it('render checkbox role=switch', () => {
    const w = mount(M3Switch, {
      props: { modelValue: false },
      attrs: { 'aria-label': '通知' },
    })
    expect(w.attributes('role')).toBe('switch')
    expect(w.classes()).toContain('m3-switch')
  })

  it('預設 unchecked', () => {
    const w = mount(M3Switch, {
      props: { modelValue: false },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).not.toContain('is-checked')
    expect(w.attributes('aria-checked')).toBe('false')
  })

  it('modelValue=true → checked', () => {
    const w = mount(M3Switch, {
      props: { modelValue: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('is-checked')
    expect(w.attributes('aria-checked')).toBe('true')
  })

  it('點擊切換', async () => {
    const w = mount(M3Switch, {
      props: { modelValue: false },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([[true]])
  })

  it('disabled 不觸發 update', async () => {
    const w = mount(M3Switch, {
      props: { modelValue: false, disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue') ?? []).toHaveLength(0)
  })

  it('disabled 套 is-disabled class', () => {
    const w = mount(M3Switch, {
      props: { modelValue: false, disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('is-disabled')
  })
})
