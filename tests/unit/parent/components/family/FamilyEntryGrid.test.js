import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FamilyEntryGrid from '@/parent/components/family/FamilyEntryGrid.vue'

const stubs = {
  'router-link': {
    template: '<a :data-to="to"><slot /></a>',
    props: ['to'],
  },
  // ParentIcon may need stubbing if it has external deps; provide a simple stub
  ParentIcon: {
    template: '<span class="parent-icon-stub" :data-name="name"></span>',
    props: ['name', 'size'],
  },
}

const ENTRIES = [
  { key: 'contact_book', label: '聯絡簿', icon: 'notebook', tint: 'contact', path: '/contact-book' },
  { key: 'attendance', label: '出席', icon: 'calendar', tint: 'attendance', path: '/attendance' },
]

describe('FamilyEntryGrid', () => {
  it('渲染傳入的每個 entry，含 label 與正確 href', () => {
    const wrapper = mount(FamilyEntryGrid, {
      props: { entries: ENTRIES, badges: {} },
      global: { stubs },
    })
    expect(wrapper.html()).toContain('聯絡簿')
    expect(wrapper.html()).toContain('出席')
    const links = wrapper.findAll('a')
    expect(links.length).toBe(2)
    expect(links[0].attributes('data-to')).toBe('/contact-book')
    expect(links[1].attributes('data-to')).toBe('/attendance')
  })

  it('badges 對應 key > 0 時顯示徽章', () => {
    const wrapper = mount(FamilyEntryGrid, {
      props: { entries: ENTRIES, badges: { contact_book: 3 } },
      global: { stubs },
    })
    const badges = wrapper.findAll('.badge')
    expect(badges.length).toBe(1)
    expect(badges[0].text()).toBe('3')
  })

  it('badges 為 0 不顯示徽章', () => {
    const wrapper = mount(FamilyEntryGrid, {
      props: { entries: ENTRIES, badges: { contact_book: 0 } },
      global: { stubs },
    })
    expect(wrapper.findAll('.badge').length).toBe(0)
  })

  it('badges > 99 顯示 99+', () => {
    const wrapper = mount(FamilyEntryGrid, {
      props: { entries: ENTRIES, badges: { contact_book: 100 } },
      global: { stubs },
    })
    const badges = wrapper.findAll('.badge')
    expect(badges.length).toBe(1)
    expect(badges[0].text()).toBe('99+')
  })
})
