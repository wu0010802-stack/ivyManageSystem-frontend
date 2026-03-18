import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { shallowMount } from '@vue/test-utils'
import AdminLayout from '@/layouts/AdminLayout.vue'

const route = reactive({ path: '/' })
const fetchSummary = vi.fn(() => Promise.resolve())

vi.mock('vue-router', () => ({
  RouterView: { template: '<div />' },
  useRoute: () => route,
}))

vi.mock('@/utils/auth', () => ({
  isLoggedIn: vi.fn(() => true),
}))

vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => ({
    approvalCount: 0,
    activityInquiryCount: 0,
    fetchSummary,
  }),
}))

describe('AdminLayout', () => {
  beforeEach(() => {
    fetchSummary.mockClear()
    route.path = '/'
  })

  it('route change refreshes notifications without bypassing TTL', async () => {
    shallowMount(AdminLayout, {
      global: {
        stubs: {
          AdminSidebar: true,
          AdminHeader: true,
          'el-container': true,
          'el-main': true,
        },
      },
    })

    await nextTick()
    expect(fetchSummary).toHaveBeenCalledTimes(1)
    expect(fetchSummary).toHaveBeenNthCalledWith(1)

    route.path = '/employees'
    await nextTick()

    expect(fetchSummary).toHaveBeenCalledTimes(2)
    expect(fetchSummary).toHaveBeenNthCalledWith(2)
  })
})
