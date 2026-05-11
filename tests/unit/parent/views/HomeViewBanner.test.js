import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// HomeView 在 mount 時會打 getHomeSummary / getTodayStatus，需要 mock 掉避免 noise。
const mockProfileApi = vi.hoisted(() => ({
  getHomeSummary: vi.fn(),
  getMe: vi.fn(),
  getChildProfile: vi.fn(),
  getTodayStatus: vi.fn(),
}))
vi.mock('@/parent/api/profile', () => mockProfileApi)

const mockAnnApi = vi.hoisted(() => ({
  listAnnouncements: vi.fn(),
  markRead: vi.fn(),
  getUnreadCount: vi.fn(),
}))
vi.mock('@/parent/api/announcements', () => mockAnnApi)

import HomeView from '@/parent/views/HomeView.vue'
import { _resetForTest } from '@/parent/composables/useTodayStatusCache'

const BANNER_KEY = 'parent_ia_v2_migration_banner_seen'

beforeEach(() => {
  setActivePinia(createPinia())
  // localStorage 由 tests/setup.js 提供 mock，是模組層 store，需明確清除
  localStorage.clear()
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

async function mountHome() {
  const wrapper = mount(HomeView, {
    global: { stubs: { teleport: true, RouterLink: true } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('HomeView IA v2 一次性遷移 banner', () => {
  it('localStorage 沒設過旗標時 banner 顯示', async () => {
    const wrapper = await mountHome()
    expect(wrapper.find('.ia-banner').exists()).toBe(true)
    expect(wrapper.find('.ia-banner-text').text()).toContain('家校')
    wrapper.unmount()
  })

  it('已設過旗標時 banner 不顯示', async () => {
    localStorage.setItem(BANNER_KEY, '1')
    const wrapper = await mountHome()
    expect(wrapper.find('.ia-banner').exists()).toBe(false)
    wrapper.unmount()
  })

  it('點關閉 dismiss banner 並寫入 localStorage', async () => {
    const wrapper = await mountHome()
    expect(wrapper.find('.ia-banner').exists()).toBe(true)
    await wrapper.find('.ia-banner-close').trigger('click')
    expect(wrapper.find('.ia-banner').exists()).toBe(false)
    expect(localStorage.getItem(BANNER_KEY)).toBe('1')
    wrapper.unmount()
  })
})
