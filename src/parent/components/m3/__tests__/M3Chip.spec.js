import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Chip from '../M3Chip.vue'

describe('M3Chip', () => {
  it('render default slot 為 label', () => {
    const w = mount(M3Chip, { slots: { default: '標籤' } })
    expect(w.text()).toContain('標籤')
  })

  it('預設 variant = assist', () => {
    const w = mount(M3Chip, { slots: { default: 'x' } })
    expect(w.classes()).toContain('m3-chip')
    expect(w.classes()).toContain('m3-chip-assist')
  })

  it.each(['assist', 'filter', 'input', 'suggestion'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3Chip, { props: { variant }, slots: { default: 'x' } })
      expect(w.classes()).toContain(`m3-chip-${variant}`)
    },
  )

  it('icon prop 渲染 leading Material Symbol', () => {
    const w = mount(M3Chip, {
      props: { icon: 'event' },
      slots: { default: 'x' },
    })
    const leading = w.find('.m3-chip-leading')
    expect(leading.exists()).toBe(true)
    expect(leading.text()).toBe('event')
  })

  it('filter variant + selected 顯示 check icon', () => {
    const w = mount(M3Chip, {
      props: { variant: 'filter', selected: true },
      slots: { default: 'x' },
    })
    expect(w.classes()).toContain('is-selected')
    expect(w.find('.m3-chip-leading').text()).toBe('check')
  })

  it('removable input chip 顯示 close icon + 觸發 remove', async () => {
    const w = mount(M3Chip, {
      props: { variant: 'input', removable: true },
      slots: { default: 'x' },
    })
    const close = w.find('.m3-chip-remove')
    expect(close.exists()).toBe(true)
    await close.trigger('click')
    expect(w.emitted('remove')).toHaveLength(1)
  })

  it('chip click 事件', async () => {
    const w = mount(M3Chip, { slots: { default: 'x' } })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 chip click 不觸發', async () => {
    const w = mount(M3Chip, {
      props: { disabled: true },
      slots: { default: 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })

  it('removable + disabled 時 remove 也不觸發', async () => {
    const w = mount(M3Chip, {
      props: { variant: 'input', removable: true, disabled: true },
      slots: { default: 'x' },
    })
    await w.find('.m3-chip-remove').trigger('click')
    expect(w.emitted('remove') ?? []).toHaveLength(0)
  })
})
