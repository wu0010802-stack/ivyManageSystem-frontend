import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3IconButton from '../M3IconButton.vue'

describe('M3IconButton', () => {
  it('render icon name', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'close' },
      attrs: { 'aria-label': '關閉' },
    })
    expect(w.text()).toBe('close')
    expect(w.attributes('aria-label')).toBe('關閉')
  })

  it('預設 variant = standard', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'menu' },
      attrs: { 'aria-label': '選單' },
    })
    expect(w.classes()).toContain('m3-icon-button')
    expect(w.classes()).toContain('m3-icon-button-standard')
  })

  it.each(['standard', 'filled', 'filled-tonal', 'outlined'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3IconButton, {
        props: { icon: 'star', variant },
        attrs: { 'aria-label': 'x' },
      })
      expect(w.classes()).toContain(`m3-icon-button-${variant}`)
    },
  )

  it('disabled 套用 attribute + class', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'star', disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.classes()).toContain('is-disabled')
  })

  it('iconFilled prop 透傳 M3Icon', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'favorite', iconFilled: true },
      attrs: { 'aria-label': '收藏' },
    })
    const inner = w.find('.material-symbols-rounded')
    const style = inner.attributes('style') || ''
    expect(style).toContain('"FILL" 1')
  })

  it('iconSize prop 透傳 M3Icon', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'menu', iconSize: 28 },
      attrs: { 'aria-label': '選單' },
    })
    const inner = w.find('.material-symbols-rounded')
    const style = inner.attributes('style') || ''
    expect(style).toContain('font-size: 28px')
  })

  it('click 事件', async () => {
    const w = mount(M3IconButton, {
      props: { icon: 'star' },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 click 不觸發', async () => {
    const w = mount(M3IconButton, {
      props: { icon: 'star', disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })
})
