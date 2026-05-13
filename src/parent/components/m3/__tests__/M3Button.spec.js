import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Button from '../M3Button.vue'

describe('M3Button', () => {
  it('render default slot 為 label', () => {
    const w = mount(M3Button, { slots: { default: '送出' } })
    expect(w.text()).toContain('送出')
  })

  it('預設 variant = filled', () => {
    const w = mount(M3Button, { slots: { default: 'OK' } })
    expect(w.classes()).toContain('m3-button')
    expect(w.classes()).toContain('m3-button-filled')
  })

  it.each(['filled', 'tonal', 'outlined', 'text', 'elevated'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3Button, { props: { variant }, slots: { default: 'x' } })
      expect(w.classes()).toContain(`m3-button-${variant}`)
    },
  )

  it('disabled prop 套用 disabled 屬性 + class', () => {
    const w = mount(M3Button, {
      props: { disabled: true },
      slots: { default: 'x' },
    })
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.classes()).toContain('is-disabled')
  })

  it('預設 type = "button"', () => {
    const w = mount(M3Button, { slots: { default: 'x' } })
    expect(w.attributes('type')).toBe('button')
  })

  it('type prop 可覆寫', () => {
    const w = mount(M3Button, {
      props: { type: 'submit' },
      slots: { default: 'x' },
    })
    expect(w.attributes('type')).toBe('submit')
  })

  it('icon slot 渲染在 label 前面', () => {
    const w = mount(M3Button, {
      slots: { default: 'Label', icon: '<span class="ico">★</span>' },
    })
    const icon = w.find('.ico')
    expect(icon.exists()).toBe(true)
    expect(w.find('.m3-button-icon').exists()).toBe(true)
    expect(w.classes()).toContain('has-leading-icon')
  })

  it('click 事件被觸發', async () => {
    const w = mount(M3Button, { slots: { default: 'x' } })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 click 不觸發', async () => {
    const w = mount(M3Button, {
      props: { disabled: true },
      slots: { default: 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })
})
