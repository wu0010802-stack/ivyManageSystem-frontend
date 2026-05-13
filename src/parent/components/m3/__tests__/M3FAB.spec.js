import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3FAB from '../M3FAB.vue'

describe('M3FAB', () => {
  it('render icon', () => {
    const w = mount(M3FAB, {
      props: { icon: 'add' },
      attrs: { 'aria-label': '新增' },
    })
    expect(w.text()).toContain('add')
    expect(w.classes()).toContain('m3-fab')
  })

  it('預設 variant=primary, size=regular', () => {
    const w = mount(M3FAB, {
      props: { icon: 'add' },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('m3-fab-primary')
    expect(w.classes()).toContain('m3-fab-regular')
  })

  it.each(['primary', 'secondary', 'tertiary', 'surface'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3FAB, {
        props: { icon: 'add', variant },
        attrs: { 'aria-label': 'x' },
      })
      expect(w.classes()).toContain(`m3-fab-${variant}`)
    },
  )

  it.each(['small', 'regular', 'large'])(
    'size=%s 套對應 class',
    (size) => {
      const w = mount(M3FAB, {
        props: { icon: 'add', size },
        attrs: { 'aria-label': 'x' },
      })
      expect(w.classes()).toContain(`m3-fab-${size}`)
    },
  )

  it('extended=true 顯示 label', () => {
    const w = mount(M3FAB, {
      props: { icon: 'edit', extended: true, label: '寫訊息' },
    })
    expect(w.classes()).toContain('is-extended')
    expect(w.find('.m3-fab-label').text()).toBe('寫訊息')
  })

  it('extended=false 不顯示 label', () => {
    const w = mount(M3FAB, {
      props: { icon: 'add', label: 'x' },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).not.toContain('is-extended')
    expect(w.find('.m3-fab-label').exists()).toBe(false)
  })

  it('disabled 套用 attribute + class', () => {
    const w = mount(M3FAB, {
      props: { icon: 'add', disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.classes()).toContain('is-disabled')
  })

  it('click 事件', async () => {
    const w = mount(M3FAB, {
      props: { icon: 'add' },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 click 不觸發', async () => {
    const w = mount(M3FAB, {
      props: { icon: 'add', disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })
})
