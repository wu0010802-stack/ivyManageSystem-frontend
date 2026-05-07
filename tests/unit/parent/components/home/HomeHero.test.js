import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeHero from '@/parent/components/home/HomeHero.vue'

const stubs = { LaurelWreath: true, KawaiiStar: true }

describe('HomeHero', () => {
  it('顯示問候語與家長名', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: '王媽媽', childrenCount: 1 },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('王媽媽')
    expect(wrapper.text()).toMatch(/早安|午安|晚安|下午好|夜深了/)
  })

  it('childrenCount=0 不顯示子女 meta', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: 'X', childrenCount: 0 },
      global: { stubs },
    })
    expect(wrapper.find('.hero-subtitle').exists()).toBe(false)
  })

  it('childrenCount>0 顯示「您今天有 N 位寶貝」', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: 'X', childrenCount: 3 },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('您今天有 3 位寶貝')
  })

  it('parentName 缺失時 fallback 「家長」', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: '', childrenCount: 0 },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('家長')
  })

  it('dailyStar 為 null 時不顯示每日之星', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: '陳媽媽', childrenCount: 1, dailyStar: null },
      global: { stubs },
    })
    expect(wrapper.find('.hero-daily-star').exists()).toBe(false)
  })

  it('dailyStar 有值時顯示每日之星文字', () => {
    const wrapper = mount(HomeHero, {
      props: {
        parentName: '陳媽媽',
        childrenCount: 1,
        dailyStar: { childName: '小明', label: '閱讀之星' },
      },
      global: { stubs },
    })
    expect(wrapper.find('.hero-daily-star').exists()).toBe(true)
    expect(wrapper.text()).toContain('小明')
    expect(wrapper.text()).toContain('閱讀之星')
  })
})

describe('HomeHero summary 行', () => {
  it('todoCount > 0 顯示件數', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: '王太太', childrenCount: 1, todoCount: 3 },
      global: { stubs },
    })
    expect(wrapper.html()).toContain('3 件事需要你處理')
  })

  it('todoCount=0 顯示正向訊息', () => {
    const wrapper = mount(HomeHero, {
      props: { parentName: '王太太', childrenCount: 1, todoCount: 0 },
      global: { stubs },
    })
    expect(wrapper.html()).toContain('今天無待辦')
  })
})
