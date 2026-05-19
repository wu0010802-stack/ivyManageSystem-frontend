import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const stubs = {
  AdminSidebar: true,
  AdminHeader: true,
  'el-container': true,
  'el-main': true,
}

describe('AdminLayout', () => {
  beforeEach(() => {
    fetchSummary.mockClear()
    route.path = '/'
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('route change does not trigger fetchSummary (perf: avoid per-page API)', async () => {
    shallowMount(AdminLayout, { global: { stubs } })

    await nextTick()
    expect(fetchSummary).toHaveBeenCalledTimes(1)

    route.path = '/employees'
    await nextTick()
    route.path = '/salary'
    await nextTick()

    expect(fetchSummary).toHaveBeenCalledTimes(1)
  })

  it('polls fetchSummary every 60 seconds while mounted', async () => {
    shallowMount(AdminLayout, { global: { stubs } })
    await nextTick()
    expect(fetchSummary).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    expect(fetchSummary).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(60_000)
    expect(fetchSummary).toHaveBeenCalledTimes(3)
  })

  it('clears the polling timer on unmount', async () => {
    const wrapper = shallowMount(AdminLayout, { global: { stubs } })
    await nextTick()
    expect(fetchSummary).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    vi.advanceTimersByTime(180_000)
    expect(fetchSummary).toHaveBeenCalledTimes(1)
  })
})
