import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Checkbox from '../M3Checkbox.vue'

describe('M3Checkbox', () => {
  it('預設 unchecked', () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: false },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('m3-checkbox')
    expect(w.classes()).not.toContain('is-checked')
    expect(w.attributes('aria-checked')).toBe('false')
  })

  it('modelValue=true → checked', () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('is-checked')
    expect(w.attributes('aria-checked')).toBe('true')
  })

  it('indeterminate 套 class + aria-checked=mixed', () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: false, indeterminate: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('is-indeterminate')
    expect(w.attributes('aria-checked')).toBe('mixed')
  })

  it('點擊切換 modelValue', async () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: false },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([[true]])
  })

  it('disabled 不觸發', async () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: false, disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue') ?? []).toHaveLength(0)
  })
})
