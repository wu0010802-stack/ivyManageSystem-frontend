import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import MoreMenuGroup from '@/parent/components/more/MoreMenuGroup.vue'

const stubs = { ParentIcon: true, RouterLink: RouterLinkStub }

const ITEMS = [
  { icon: 'money', title: '費用查詢', path: '/fees', tint: 'money' },
  { icon: 'signature', title: '事件簽閱', path: '/events', tint: 'event' },
]

describe('MoreMenuGroup', () => {
  it('渲染 title 與所有 menu items', () => {
    const wrapper = mount(MoreMenuGroup, {
      props: { title: '財務與簽閱', items: ITEMS },
      global: { stubs },
    })
    expect(wrapper.find('.group-title').text()).toBe('財務與簽閱')
    const items = wrapper.findAll('.menu-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('費用查詢')
    expect(items[1].text()).toContain('事件簽閱')
  })

  it('每個 router-link 帶 to=item.path', () => {
    const wrapper = mount(MoreMenuGroup, {
      props: { title: '帳號設定', items: ITEMS },
      global: { stubs },
    })
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(2)
    expect(links[0].props('to')).toBe('/fees')
    expect(links[1].props('to')).toBe('/events')
  })

  it('icon 套用 tint-{tint} class', () => {
    const wrapper = mount(MoreMenuGroup, {
      props: { title: 'X', items: ITEMS },
      global: { stubs },
    })
    const icons = wrapper.findAll('.menu-item .icon')
    expect(icons[0].classes()).toContain('tint-money')
    expect(icons[1].classes()).toContain('tint-event')
  })

  it('items 為空時仍渲染標題', () => {
    const wrapper = mount(MoreMenuGroup, {
      props: { title: '空群組', items: [] },
      global: { stubs },
    })
    expect(wrapper.find('.group-title').text()).toBe('空群組')
    expect(wrapper.findAll('.menu-item')).toHaveLength(0)
  })
})
