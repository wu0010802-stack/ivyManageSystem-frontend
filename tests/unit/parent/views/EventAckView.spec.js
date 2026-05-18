import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockEventsApi = vi.hoisted(() => ({
  listEvents: vi.fn(),
  acknowledgeEvent: vi.fn(),
}))
vi.mock('@/parent/api/events', () => mockEventsApi)

vi.mock('@/parent/api/medications', () => ({
  uploadAckSignature: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn(), warn: vi.fn(), success: vi.fn() },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { eventId: 999 }, query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

import EventAckView from '@/parent/views/EventAckView.vue'

describe('EventAckView — 找不到事件時顯示 not-found（P1-18）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockEventsApi.listEvents.mockReset()
    mockEventsApi.acknowledgeEvent.mockReset()
  })

  it('listEvents 回空清單 → 不再顯示 skeleton；顯示 not-found 空狀態', async () => {
    mockEventsApi.listEvents.mockResolvedValue({ data: { items: [] } })

    const wrapper = mount(EventAckView, {
      global: {
        stubs: {
          SignaturePad: true,
          SkeletonBlock: { template: '<div class="skeleton-stub"></div>' },
        },
      },
    })
    await flushPromises()

    // 不再卡在 skeleton
    expect(wrapper.find('.skeleton-stub').exists()).toBe(false)
    // 也不會 render 簽收表單
    expect(wrapper.find('.form-card').exists()).toBe(false)
    // 顯示空狀態（class 名 not-found 或 empty-state；以 text 為主要 contract）
    expect(wrapper.text()).toMatch(/找不到此事件|事件不存在|連結.*失效/)
  })

  it('listEvents 失敗 → 顯示 not-found（避免永久 skeleton）', async () => {
    mockEventsApi.listEvents.mockRejectedValue(new Error('boom'))

    const wrapper = mount(EventAckView, {
      global: {
        stubs: {
          SignaturePad: true,
          SkeletonBlock: { template: '<div class="skeleton-stub"></div>' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('.skeleton-stub').exists()).toBe(false)
    expect(wrapper.text()).toMatch(/找不到此事件|事件不存在|連結.*失效|載入失敗/)
  })

  it('listEvents 找到對應事件 → render 簽收表單，無 not-found', async () => {
    mockEventsApi.listEvents.mockResolvedValue({
      data: {
        items: [
          { id: 999, title: '校外教學', event_date: '2026-05-20', description: '帶水壺' },
        ],
      },
    })

    const wrapper = mount(EventAckView, {
      global: {
        stubs: {
          SignaturePad: true,
          SkeletonBlock: { template: '<div class="skeleton-stub"></div>' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('校外教學')
    expect(wrapper.find('.form-card').exists()).toBe(true)
    expect(wrapper.text()).not.toMatch(/找不到此事件|事件不存在/)
  })
})
