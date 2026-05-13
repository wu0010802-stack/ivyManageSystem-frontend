import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3List from '../M3List.vue'
import M3ListItem from '../M3ListItem.vue'

describe('M3List', () => {
  it('render ul role=list 容器', () => {
    const w = mount(M3List, { slots: { default: '<li>x</li>' } })
    expect(w.element.tagName).toBe('UL')
    expect(w.classes()).toContain('m3-list')
    expect(w.attributes('role')).toBe('list')
  })
})

describe('M3ListItem', () => {
  it('headline 必填，render headline', () => {
    const w = mount(M3ListItem, { props: { headline: '今日活動' } })
    expect(w.text()).toContain('今日活動')
    expect(w.find('.m3-list-item-headline').exists()).toBe(true)
  })

  it('supportingText 渲染兩行版（套 two-line class）', () => {
    const w = mount(M3ListItem, {
      props: { headline: '訊息', supportingText: '14:00 美術教室' },
    })
    expect(w.classes()).toContain('m3-list-item-two-line')
    expect(w.find('.m3-list-item-supporting').text()).toBe('14:00 美術教室')
  })

  it('overline + headline 三行版（套 three-line）', () => {
    const w = mount(M3ListItem, {
      props: { headline: '主標題', overline: '類別', supportingText: '副文' },
    })
    expect(w.classes()).toContain('m3-list-item-three-line')
    expect(w.find('.m3-list-item-overline').text()).toBe('類別')
  })

  it('預設一行版（只有 headline）', () => {
    const w = mount(M3ListItem, { props: { headline: '單行' } })
    expect(w.classes()).toContain('m3-list-item-one-line')
  })

  it('leadingIcon 渲染 Material Symbol', () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', leadingIcon: 'home' },
    })
    const leading = w.find('.m3-list-item-leading')
    expect(leading.exists()).toBe(true)
    expect(leading.text()).toBe('home')
  })

  it('leading slot 覆蓋 leadingIcon', () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', leadingIcon: 'home' },
      slots: { leading: '<span class="custom">★</span>' },
    })
    expect(w.find('.custom').exists()).toBe(true)
    expect(w.find('.material-symbols-rounded').exists()).toBe(false)
  })

  it('trailingIcon 渲染', () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', trailingIcon: 'chevron_right' },
    })
    const trailing = w.find('.m3-list-item-trailing')
    expect(trailing.exists()).toBe(true)
    expect(trailing.text()).toBe('chevron_right')
  })

  it('clickable=true 加 button role + emit click', async () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', clickable: true },
    })
    expect(w.attributes('role')).toBe('button')
    expect(w.attributes('tabindex')).toBe('0')
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 click 不觸發', async () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', clickable: true, disabled: true },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })
})
