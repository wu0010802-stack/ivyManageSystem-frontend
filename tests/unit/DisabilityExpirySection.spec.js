import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import DisabilityExpirySection from '@/components/dashboard/DisabilityExpirySection.vue'
import * as govMoe from '@/api/govMoe'

vi.mock('@/api/govMoe')

// Minimal stubs so Vue doesn't throw on unknown EP components
const ElCard = defineComponent({
  name: 'ElCard',
  props: ['shadow'],
  setup(_, { slots }) {
    return () => h('div', { class: 'disability-expiry-card' }, [
      slots.header?.(),
      slots.default?.(),
    ])
  },
})

const ElIcon = defineComponent({
  name: 'ElIcon',
  setup(_, { slots }) {
    return () => h('span', { class: 'el-icon' }, slots.default?.())
  },
})

const ElTag = defineComponent({
  name: 'ElTag',
  props: ['size', 'type', 'effect'],
  setup(_, { slots }) {
    return () => h('span', { class: 'el-tag' }, slots.default?.())
  },
})

const globalStubs = {
  plugins: [],
  components: { ElCard, ElIcon, ElTag },
}

describe('DisabilityExpirySection', () => {
  it('hides itself when total = 0', async () => {
    govMoe.getDisabilityExpiryWidget = vi.fn().mockResolvedValue({
      data: { total: 0, days_window: 30, students: [] },
    })
    const wrapper = mount(DisabilityExpirySection, { global: globalStubs })
    await flushPromises()
    expect(wrapper.find('.disability-expiry-card').exists()).toBe(false)
  })

  it('shows badge with count when there are expiries', async () => {
    govMoe.getDisabilityExpiryWidget = vi.fn().mockResolvedValue({
      data: {
        total: 2,
        days_window: 30,
        students: [
          { id: 1, student_id: 'S001', name: '甲', disability_cert_expiry: '2026-05-30', days_remaining: 19, disability_cert_no: 'X' },
          { id: 2, student_id: 'S002', name: '乙', disability_cert_expiry: '2026-06-05', days_remaining: 25, disability_cert_no: 'Y' },
        ],
      },
    })
    const wrapper = mount(DisabilityExpirySection, { global: globalStubs })
    await flushPromises()
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('甲')
  })
})
