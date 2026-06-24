import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SectionHeader from '../SectionHeader.vue'

describe('SectionHeader', () => {
  it('render title', () => {
    const w = mount(SectionHeader, { props: { title: '今日狀態' } })
    expect(w.find('.pt-section-title').text()).toBe('今日狀態')
  })

  it('action slot 渲染', () => {
    const w = mount(SectionHeader, {
      props: { title: 'x' },
      slots: { action: '<a class="more">更多</a>' },
    })
    expect(w.find('.more').exists()).toBe(true)
  })
})
