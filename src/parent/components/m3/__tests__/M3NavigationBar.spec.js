import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3NavigationBar from '../M3NavigationBar.vue'

const ITEMS = [
  { key: 'home', label: '首頁', icon: 'home', path: '/home' },
  { key: 'messages', label: '訊息', icon: 'chat', path: '/messages', badge: 3 },
  { key: 'admin', label: '事務', icon: 'assignment', path: '/admin' },
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
    expect(emitted[0][0]).toBe('admin')
    expect(emitted[0][1]).toMatchObject({ key: 'admin', label: '事務' })
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

  describe('prominent tab（永久隆起 FAB）', () => {
    const PROMINENT_ITEMS = [
      ITEMS[0],
      ITEMS[1],
      { key: 'contact-book', label: '聯絡簿', icon: 'menu_book', path: '/contact-book', badge: 2, prominent: true },
      ITEMS[2],
      ITEMS[3],
    ]

    it('沒有 prominent item 時 nav 不掛 has-prominent、不設凹槽變數', () => {
      const w = mount(M3NavigationBar, { props: { items: ITEMS, currentKey: 'home' } })
      expect(w.classes()).not.toContain('has-prominent')
      expect(w.attributes('style') || '').not.toContain('--m3-nav-notch-x')
      expect(w.find('.m3-nav-fab').exists()).toBe(false)
    })

    it('prominent item 掛 is-prominent + m3-nav-fab，凹槽對齊該 tab 中線', () => {
      const w = mount(M3NavigationBar, { props: { items: PROMINENT_ITEMS, currentKey: 'home' } })
      expect(w.classes()).toContain('has-prominent')
      expect(w.attributes('style')).toContain('--m3-nav-notch-x: 50%')
      const tab = w.findAll('.m3-nav-tab')[2]
      expect(tab.classes()).toContain('is-prominent')
      expect(tab.find('.m3-nav-fab').exists()).toBe(true)
      expect(tab.find('.m3-nav-tab-indicator').exists()).toBe(false)
      expect(tab.find('.m3-nav-tab-dot').exists()).toBe(true)
    })

    it('prominent tab 不論是否 active 都保留 aria-label / 標籤 / badge', () => {
      const w = mount(M3NavigationBar, { props: { items: PROMINENT_ITEMS, currentKey: 'home' } })
      const tab = w.findAll('.m3-nav-tab')[2]
      expect(tab.attributes('aria-label')).toBe('聯絡簿')
      expect(tab.attributes('aria-current')).toBeUndefined()
      expect(tab.find('.m3-nav-tab-label').text()).toBe('聯絡簿')
      expect(tab.find('.m3-nav-fab .m3-nav-tab-badge').text()).toBe('2')
      expect(tab.find('.material-symbols-rounded').attributes('style')).toContain('"FILL" 0')
    })

    it('prominent tab 為 active 時：aria-current=page + filled icon + is-active', async () => {
      const w = mount(M3NavigationBar, { props: { items: PROMINENT_ITEMS, currentKey: 'contact-book' } })
      const tab = w.findAll('.m3-nav-tab')[2]
      expect(tab.classes()).toContain('is-active')
      expect(tab.attributes('aria-current')).toBe('page')
      expect(tab.find('.material-symbols-rounded').attributes('style')).toContain('"FILL" 1')
      await tab.trigger('click')
      expect(w.emitted('select')[0][0]).toBe('contact-book')
    })
  })
})
