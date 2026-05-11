import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FamilyTimeline from '@/parent/components/family/FamilyTimeline.vue'

const stubs = {
  'router-link': {
    template: '<a :data-to="to"><slot /></a>',
    props: ['to'],
  },
}

const baseItem = {
  kind: 'attendance',
  id: 'attendance:1',
  title: '出勤狀態：出席',
  subtitle: '2026-05-07',
  occurred_at: '2026-05-07T09:12:00',
  is_pending: false,
  href: '/attendance',
}

describe('FamilyTimeline', () => {
  it('loading=true 時顯示 skeleton', () => {
    const wrapper = mount(FamilyTimeline, {
      props: { items: [], loading: true },
      global: { stubs },
    })
    expect(wrapper.find('[data-testid="timeline-skeleton"]').exists()).toBe(true)
  })

  it('items=[] 顯示 empty state', () => {
    const wrapper = mount(FamilyTimeline, {
      props: { items: [], loading: false },
      global: { stubs },
    })
    expect(wrapper.html()).toContain('目前沒有最新動態')
  })

  it('每筆 item 渲染 title 並含 router-link 指向 href', () => {
    const wrapper = mount(FamilyTimeline, {
      props: { items: [baseItem], loading: false },
      global: { stubs },
    })
    expect(wrapper.html()).toContain('出勤狀態：出席')
    const links = wrapper.findAll('a')
    expect(links.length).toBe(1)
    expect(links[0].attributes('data-to')).toBe('/attendance')
  })

  it('is_pending=true 顯示紅點標記', () => {
    const wrapper = mount(FamilyTimeline, {
      props: { items: [{ ...baseItem, is_pending: true }], loading: false },
      global: { stubs },
    })
    expect(wrapper.find('.pending-dot').exists()).toBe(true)
  })
})
