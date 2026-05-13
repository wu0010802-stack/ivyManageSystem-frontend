import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3SegmentedButton from '../M3SegmentedButton.vue'

const ITEMS = [
  { value: 'day', label: '日' },
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
]

describe('M3SegmentedButton', () => {
  it('render N 個 segment', () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: 'day' },
    })
    expect(w.findAll('.m3-segment')).toHaveLength(3)
  })

  it('selected segment 套 is-selected class', () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: 'week' },
    })
    const segs = w.findAll('.m3-segment')
    expect(segs[0].classes()).not.toContain('is-selected')
    expect(segs[1].classes()).toContain('is-selected')
  })

  it('點 segment (single) 觸發 update:modelValue', async () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: 'day' },
    })
    await w.findAll('.m3-segment')[2].trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([['month']])
  })

  it('multiple=true 時 modelValue 應為 array', async () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: ['day'], multiple: true },
    })
    await w.findAll('.m3-segment')[1].trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual(['day', 'week'])
  })

  it('multiple 模式再次點已選 segment 則移除', async () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: ['day', 'week'], multiple: true },
    })
    await w.findAll('.m3-segment')[0].trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted[0][0]).toEqual(['week'])
  })

  it('label 渲染', () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: 'day' },
    })
    expect(w.findAll('.m3-segment')[0].text()).toContain('日')
  })

  it('icon prop 渲染 leading icon', () => {
    const items = [{ value: 'a', label: 'A', icon: 'star' }]
    const w = mount(M3SegmentedButton, {
      props: { items, modelValue: 'a' },
    })
    expect(w.find('.material-symbols-rounded').exists()).toBe(true)
  })
})
