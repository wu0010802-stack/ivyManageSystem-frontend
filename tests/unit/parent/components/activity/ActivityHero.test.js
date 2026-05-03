import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityHero from '@/parent/components/activity/ActivityHero.vue'

describe('ActivityHero', () => {
  it('渲染三段統計（進行中 / 待繳 / 即將開課）', () => {
    const wrapper = mount(ActivityHero, {
      props: { activeRegistrations: 2, unpaidActivityFee: 3000, upcomingCount: 1 },
    })
    const stats = wrapper.findAll('.act-hero-stat')
    expect(stats).toHaveLength(3)
    const text = wrapper.text()
    expect(text).toContain('2')
    expect(text).toContain('進行中')
    expect(text).toContain('待繳')
    expect(text).toContain('即將開課')
  })

  it('金額用千分位格式 + NT$ 前綴', () => {
    const wrapper = mount(ActivityHero, {
      props: { activeRegistrations: 0, unpaidActivityFee: 12500, upcomingCount: 0 },
    })
    expect(wrapper.text()).toContain('NT$ 12,500')
  })

  it('點擊三段分別 emit scroll-section + 對應 key', async () => {
    const wrapper = mount(ActivityHero, {
      props: { activeRegistrations: 1, unpaidActivityFee: 0, upcomingCount: 0 },
    })
    const stats = wrapper.findAll('.act-hero-stat')
    await stats[0].trigger('click')
    await stats[1].trigger('click')
    await stats[2].trigger('click')
    const events = wrapper.emitted('scroll-section')
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual(['active'])
    expect(events[1]).toEqual(['unpaid'])
    expect(events[2]).toEqual(['upcoming'])
  })
})
