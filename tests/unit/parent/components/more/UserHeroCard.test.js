import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserHeroCard from '@/parent/components/more/UserHeroCard.vue'

const stubs = { ParentIcon: true }

describe('UserHeroCard', () => {
  it('顯示家長名、avatar 首字、子女字串', () => {
    const wrapper = mount(UserHeroCard, {
      props: {
        userName: '王小明',
        avatarInitial: '王',
        childrenLabel: '小寶、二寶',
        canPush: true,
        pushStatusKnown: true,
      },
      global: { stubs },
    })
    expect(wrapper.find('.user-name').text()).toBe('王小明')
    expect(wrapper.find('.user-avatar').text()).toBe('王')
    expect(wrapper.find('.user-children').text()).toContain('小寶、二寶')
  })

  it('canPush=true 顯示綠色 ok badge；warn 不出現', () => {
    const wrapper = mount(UserHeroCard, {
      props: {
        userName: '家長',
        canPush: true,
        pushStatusKnown: true,
      },
      global: { stubs },
    })
    expect(wrapper.find('.badge.ok').exists()).toBe(true)
    expect(wrapper.find('.badge.warn').exists()).toBe(false)
    expect(wrapper.text()).toContain('LINE 推播已啟用')
  })

  it('canPush=false 顯示 warn badge', () => {
    const wrapper = mount(UserHeroCard, {
      props: {
        userName: '家長',
        canPush: false,
        pushStatusKnown: true,
      },
      global: { stubs },
    })
    expect(wrapper.find('.badge.warn').exists()).toBe(true)
    expect(wrapper.find('.badge.ok').exists()).toBe(false)
    expect(wrapper.text()).toContain('尚未加 LINE')
  })

  it('pushStatusKnown=false 時 hide push 區塊（me 還沒載入）', () => {
    const wrapper = mount(UserHeroCard, {
      props: {
        userName: '家長',
        canPush: false,
        pushStatusKnown: false,
      },
      global: { stubs },
    })
    expect(wrapper.find('.user-push').exists()).toBe(false)
  })
})
