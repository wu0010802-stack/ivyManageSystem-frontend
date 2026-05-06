import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockProfileApi = vi.hoisted(() => ({
  getHomeSummary: vi.fn(),
  getMe: vi.fn(),
  getChildProfile: vi.fn(),
  getTodayStatus: vi.fn(),
}))
vi.mock('@/parent/api/profile', () => mockProfileApi)

const mockAnnApi = vi.hoisted(() => ({ listAnnouncements: vi.fn(), markRead: vi.fn(), getUnreadCount: vi.fn() }))
vi.mock('@/parent/api/announcements', () => mockAnnApi)

import HomeView from '@/parent/views/HomeView.vue'
import PullToRefresh from '@/parent/components/PullToRefresh.vue'
import { _resetForTest } from '@/parent/composables/useTodayStatusCache'

describe('HomeView pullRefresh', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    _resetForTest()
    mockProfileApi.getHomeSummary.mockResolvedValue({
      data: {
        me: { name: '測試家長', can_push: true },
        children: [],
        summary: { fees: { outstanding_count: 0, outstanding: 0, overdue: 0 } },
      },
    })
    mockProfileApi.getTodayStatus.mockResolvedValue({ data: { children: [] } })
  })

  it('下拉刷新不會 throw 且兩支 API 都被重打', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(HomeView, {
      global: { stubs: { teleport: true, RouterLink: true } },
      attachTo: document.body,
    })
    await flushPromises()

    // 重置模組層快取 singleton，確保下拉刷新不被 60s TTL 擋住
    _resetForTest()
    sessionStorage.clear()
    mockProfileApi.getHomeSummary.mockClear()
    mockProfileApi.getTodayStatus.mockClear()

    const ptr = wrapper.findComponent(PullToRefresh)
    await ptr.vm._triggerRefresh()
    await flushPromises()

    const ptrWarnings = consoleWarnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[PullToRefresh] refresh failed'),
    )
    expect(ptrWarnings).toHaveLength(0)

    expect(mockProfileApi.getHomeSummary).toHaveBeenCalledTimes(1)
    expect(mockProfileApi.getTodayStatus).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    consoleWarnSpy.mockRestore()
  })
})
