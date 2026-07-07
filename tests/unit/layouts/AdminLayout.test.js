import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
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

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
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
    mockIsMobile.value = false
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

  it('離開手機視窗時自動關閉手機側欄', async () => {
    mockIsMobile.value = true
    const wrapper = shallowMount(AdminLayout, { global: { stubs, renderStubDefaultSlot: true } })
    await nextTick()
    // 透過 header 切開側欄
    wrapper.findComponent({ name: 'AdminHeader' }).vm.$emit('toggle-sidebar')
    await nextTick()
    expect(wrapper.findComponent({ name: 'AdminSidebar' }).props('mobileOpen')).toBe(true)
    // 切回桌機 → watch 應關閉側欄
    mockIsMobile.value = false
    await nextTick()
    expect(wrapper.findComponent({ name: 'AdminSidebar' }).props('mobileOpen')).toBe(false)
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
