import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Radio from '../M3Radio.vue'

describe('M3Radio', () => {
  it('value 等於 modelValue 時為 selected', () => {
    const w = mount(M3Radio, {
      props: { modelValue: 'a', value: 'a' },
      attrs: { 'aria-label': 'A' },
    })
    expect(w.classes()).toContain('m3-radio')
    expect(w.classes()).toContain('is-selected')
    expect(w.attributes('aria-checked')).toBe('true')
  })

  it('value 不等於 modelValue 時為 unselected', () => {
    const w = mount(M3Radio, {
      props: { modelValue: 'a', value: 'b' },
      attrs: { 'aria-label': 'B' },
    })
    expect(w.classes()).not.toContain('is-selected')
    expect(w.attributes('aria-checked')).toBe('false')
  })

  it('點擊觸發 update:modelValue 為 value', async () => {
    const w = mount(M3Radio, {
      props: { modelValue: 'a', value: 'b' },
      attrs: { 'aria-label': 'B' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([['b']])
  })

  it('disabled 不觸發', async () => {
    const w = mount(M3Radio, {
      props: { modelValue: 'a', value: 'b', disabled: true },
      attrs: { 'aria-label': 'B' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue') ?? []).toHaveLength(0)
  })
})
