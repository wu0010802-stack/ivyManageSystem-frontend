import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeHero from '@/parent/components/home/HomeHero.vue'

describe('HomeHero', () => {
  it('顯示問候語與家長名', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: '王媽媽', childrenCount: 1 },
    })
    expect(wrapper.text()).toContain('王媽媽')
    expect(wrapper.text()).toMatch(/早安|午安|晚安|下午好|夜深了/)
  })

  it('childrenCount=0 不顯示子女 meta', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: 'X', childrenCount: 0 },
    })
    expect(wrapper.text()).not.toContain('照顧')
  })

  it('childrenCount>0 顯示「照顧 N 位寶貝」', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: 'X', childrenCount: 3 },
    })
    expect(wrapper.text()).toContain('照顧 3 位寶貝')
  })

  it('parentName 缺失時 fallback 「家長」', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: '', childrenCount: 0 },
    })
    expect(wrapper.text()).toContain('家長')
  })
})
