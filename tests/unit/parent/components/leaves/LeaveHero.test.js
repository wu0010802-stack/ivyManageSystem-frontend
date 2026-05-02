import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveHero from '@/parent/components/leaves/LeaveHero.vue'

describe('LeaveHero', () => {
  it('顯示總天數與分項 chips', () => {
    const wrapper = mount(LeaveHero, {
      props: {
        summary: {
          total_used: 5,
          by_type: { sick: 2, personal: 3 },
          semester_label: '114 上學期',
        },
      },
    })
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('114 上學期')
    expect(wrapper.text()).toContain('病假')
    expect(wrapper.text()).toContain('事假')
  })

  it('action slot 顯示在右側', () => {
    const wrapper = mount(LeaveHero, {
      props: { summary: { total_used: 0, by_type: {}, semester_label: '' } },
      slots: { action: '<button class="cta">申請請假</button>' },
    })
    expect(wrapper.find('.cta').exists()).toBe(true)
  })
})
