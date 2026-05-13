import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3NavigationBar from '../M3NavigationBar.vue'

const ITEMS = [
  { key: 'home', label: '首頁', icon: 'home', path: '/home' },
  { key: 'messages', label: '訊息', icon: 'chat', path: '/messages', badge: 3 },
  { key: 'family', label: '家校', icon: 'school', path: '/family' },
  { key: 'me', label: '我的', icon: 'person', path: '/me' },
]

describe('M3NavigationBar', () => {
  it('render nav role=navigation', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    expect(w.element.tagName).toBe('NAV')
    expect(w.attributes('role')).toBe('navigation')
    expect(w.classes()).toContain('m3-navigation-bar')
  })

  it('每個 item 對應一個 tab', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    expect(w.findAll('.m3-nav-tab')).toHaveLength(4)
  })

  it('current tab 套 is-active class', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'messages' },
    })
    const tabs = w.findAll('.m3-nav-tab')
    expect(tabs[0].classes()).not.toContain('is-active')
    expect(tabs[1].classes()).toContain('is-active')
  })

  it('active tab 的 icon 為 filled 變體', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const homeTab = w.findAll('.m3-nav-tab')[0]
    const style = homeTab.find('.material-symbols-rounded').attributes('style') || ''
    expect(style).toContain('"FILL" 1')
  })

  it('inactive tab 的 icon 為 outline 變體', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const messagesTab = w.findAll('.m3-nav-tab')[1]
    const style = messagesTab.find('.material-symbols-rounded').attributes('style') || ''
    expect(style).toContain('"FILL" 0')
  })

  it('label 套 m3-label-medium', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const labels = w.findAll('.m3-nav-tab-label')
    expect(labels[0].classes()).toContain('m3-label-medium')
    expect(labels[0].text()).toBe('首頁')
  })

  it('badge > 0 顯示 chip + 數字', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const messagesTab = w.findAll('.m3-nav-tab')[1]
    expect(messagesTab.find('.m3-nav-tab-badge').exists()).toBe(true)
    expect(messagesTab.find('.m3-nav-tab-badge').text()).toBe('3')
  })

  it('badge > 99 顯示 99+', () => {
    const items = [...ITEMS]
    items[1] = { ...items[1], badge: 120 }
    const w = mount(M3NavigationBar, {
      props: { items, currentKey: 'home' },
    })
    const messagesTab = w.findAll('.m3-nav-tab')[1]
    expect(messagesTab.find('.m3-nav-tab-badge').text()).toBe('99+')
  })

  it('badge 為 0 或 undefined 不顯示', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const homeTab = w.findAll('.m3-nav-tab')[0]
    expect(homeTab.find('.m3-nav-tab-badge').exists()).toBe(false)
  })

  it('點 tab 觸發 select 事件帶 key + item', async () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    await w.findAll('.m3-nav-tab')[2].trigger('click')
    const emitted = w.emitted('select')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe('family')
    expect(emitted[0][1]).toMatchObject({ key: 'family', label: '家校' })
  })

  it('activeIcon 覆寫 active 狀態的 icon name', () => {
    const items = [
      { key: 'a', label: 'A', icon: 'home', activeIcon: 'cottage', path: '/a' },
      { key: 'b', label: 'B', icon: 'chat', path: '/b' },
    ]
    const w = mount(M3NavigationBar, { props: { items, currentKey: 'a' } })
    const activeTab = w.findAll('.m3-nav-tab')[0]
    expect(activeTab.find('.material-symbols-rounded').text()).toBe('cottage')
  })
})
