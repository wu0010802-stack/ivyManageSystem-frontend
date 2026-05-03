import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import QuickActions from '@/parent/components/home/QuickActions.vue'

const stubs = { ParentIcon: true }

describe('QuickActions', () => {
  it('渲染所有 actions', () => {
    const wrapper = mount(QuickActions, {
      props: {
        actions: [
          { icon: 'notebook', label: '聯絡簿', path: '/contact-book', tint: 'contact' },
          { icon: 'pill', label: '用藥單', path: '/medications', tint: 'medication' },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.findAll('.quick-tile').length).toBe(2)
    expect(wrapper.text()).toContain('聯絡簿')
    expect(wrapper.text()).toContain('用藥單')
  })

  it('actions 為空時不渲染 tile（仍保留標題）', () => {
    const wrapper = mount(QuickActions, { props: { actions: [] }, global: { stubs } })
    expect(wrapper.findAll('.quick-tile').length).toBe(0)
    expect(wrapper.text()).toContain('常用操作')
  })

  it('點擊 tile emit navigate(path)', async () => {
    const wrapper = mount(QuickActions, {
      props: {
        actions: [
          { icon: 'pill', label: '用藥單', path: '/medications', tint: 'medication' },
        ],
      },
      global: { stubs },
    })
    await wrapper.find('.quick-tile').trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')[0]).toEqual(['/medications'])
  })

  it('quick-icon 套用 tint class', () => {
    const wrapper = mount(QuickActions, {
      props: {
        actions: [
          { icon: 'calendar', label: '行程', path: '/calendar', tint: 'calendar' },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.find('.quick-icon').classes()).toContain('tint-calendar')
  })
})
