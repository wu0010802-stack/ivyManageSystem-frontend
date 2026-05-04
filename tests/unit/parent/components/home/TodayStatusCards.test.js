import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const cacheMock = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ref } = require('vue')
  return {
    status: ref(null),
    loading: ref(false),
    refresh: vi.fn().mockResolvedValue(undefined),
    markStale: vi.fn(),
  }
})

vi.mock('@/parent/composables/useTodayStatusCache', () => ({
  useTodayStatusCache: () => cacheMock,
}))

import TodayStatusCards from '@/parent/components/home/TodayStatusCards.vue'

const stubs = { ParentIcon: true }

describe('TodayStatusCards', () => {
  beforeEach(() => {
    cacheMock.status.value = null
    cacheMock.refresh.mockClear()
  })

  it('mount 時呼叫 refresh', async () => {
    mount(TodayStatusCards, { global: { stubs } })
    await flushPromises()
    expect(cacheMock.refresh).toHaveBeenCalledTimes(1)
  })

  it('children 為空時不渲染 section', async () => {
    cacheMock.status.value = { children: [] }
    const wrapper = mount(TodayStatusCards, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.today-section').exists()).toBe(false)
  })

  it('children 有資料時渲染卡片含 attendance/leave/medication/dismissal chips', async () => {
    cacheMock.status.value = {
      children: [
        {
          student_id: 1,
          name: '王小明',
          classroom_name: '小班A',
          attendance: { status: '已到校' },
          leave: { type: '事假' },
          medication: { has_order: true, order_count: 2 },
          dismissal: { status: 'completed' },
        },
      ],
    }
    const wrapper = mount(TodayStatusCards, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.today-section').exists()).toBe(true)
    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).toContain('小班A')
    expect(wrapper.text()).toContain('已到校')
    expect(wrapper.text()).toContain('事假')
    expect(wrapper.text()).toContain('用藥 2 次')
    expect(wrapper.text()).toContain('已接送')
  })

  it('attendance=null 時顯示「尚未到校」chip', async () => {
    cacheMock.status.value = {
      children: [{ student_id: 1, name: 'X', medication: { has_order: false } }],
    }
    const wrapper = mount(TodayStatusCards, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('尚未到校')
  })

  it('dismissalLabel 各狀態文案', async () => {
    cacheMock.status.value = {
      children: [
        { student_id: 1, name: 'A', medication: { has_order: false }, dismissal: { status: 'pending' } },
        { student_id: 2, name: 'B', medication: { has_order: false }, dismissal: { status: 'acknowledged' } },
      ],
    }
    const wrapper = mount(TodayStatusCards, { global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('老師處理中')
    expect(wrapper.text()).toContain('老師已收到')
  })
})
