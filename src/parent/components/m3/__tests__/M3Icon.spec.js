import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Icon from '../M3Icon.vue'

describe('M3Icon', () => {
  it('render name 為 Material Symbols ligature', () => {
    const w = mount(M3Icon, { props: { name: 'home' } })
    expect(w.text()).toBe('home')
    expect(w.classes()).toContain('material-symbols-rounded')
    expect(w.classes()).toContain('m3-icon')
  })

  it('size prop 控制 font-size', () => {
    const w = mount(M3Icon, { props: { name: 'menu', size: 32 } })
    const style = w.attributes('style') || ''
    expect(style).toContain('font-size: 32px')
  })

  it('預設裝飾性（aria-hidden）', () => {
    const w = mount(M3Icon, { props: { name: 'star' } })
    expect(w.attributes('aria-hidden')).toBe('true')
  })

  it('提供 aria-label 時不是裝飾性', () => {
    const w = mount(M3Icon, {
      props: { name: 'close' },
      attrs: { 'aria-label': '關閉' },
    })
    expect(w.attributes('aria-hidden')).toBeUndefined()
    expect(w.attributes('aria-label')).toBe('關閉')
  })

  it('filled prop 切換 FILL variation', () => {
    const w = mount(M3Icon, { props: { name: 'favorite', filled: true } })
    const style = w.attributes('style') || ''
    expect(style).toContain('"FILL" 1')
  })
})
