import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { shallowMount } from '@vue/test-utils'
import AdminLayout from '@/layouts/AdminLayout.vue'

// F6：背景分頁（document.hidden）時不應發出通知輪詢，省後端負載 / quota。
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
    activityPendingReviewCount: 0,
    fetchSummary,
  }),
}))

const stubs = {
  AdminSidebar: true,
  AdminHeader: true,
  'el-container': true,
  'el-main': true,
}

function setHidden(val) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => val })
}

describe('AdminLayout 背景分頁輪詢暫停（F6）', () => {
  beforeEach(() => {
    fetchSummary.mockClear()
    route.path = '/'
    vi.useFakeTimers()
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
  })

  it('分頁隱藏時 60s 輪詢不發出 fetchSummary', async () => {
    shallowMount(AdminLayout, { global: { stubs } })
    await nextTick()
    const initial = fetchSummary.mock.calls.length // onMounted 首載

    // 切到背景
    setHidden(true)
    vi.advanceTimersByTime(60_000)
    vi.advanceTimersByTime(60_000)
    // 隱藏期間輪詢應被跳過
    expect(fetchSummary.mock.calls.length).toBe(initial)

    // 切回前景後輪詢恢復
    setHidden(false)
    vi.advanceTimersByTime(60_000)
    expect(fetchSummary.mock.calls.length).toBeGreaterThan(initial)
  })
})
