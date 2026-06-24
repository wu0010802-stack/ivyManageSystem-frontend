import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// F6：教師工作台 60s 輪詢於背景分頁（document.hidden）時應跳過。
vi.mock('@/api/portalClassHub', () => ({
  getTodayHub: vi.fn(() => Promise.resolve({ counts: {} })),
}))

import { getTodayHub } from '@/api/portalClassHub'
import { usePortalClassHub } from '@/composables/usePortalClassHub'

function setHidden(val: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => val })
}

describe('usePortalClassHub 背景分頁輪詢暫停（F6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setHidden(false)
    vi.mocked(getTodayHub).mockResolvedValue({ counts: {} } as never)
  })
  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
  })

  it('分頁隱藏時 60s 輪詢不發出 getTodayHub', async () => {
    const TestComp = {
      setup() {
        return usePortalClassHub()
      },
      template: '<div />',
    }
    const wrapper = mount(TestComp)
    await flushPromises() // onMounted 首載
    const initial = vi.mocked(getTodayHub).mock.calls.length

    setHidden(true)
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(vi.mocked(getTodayHub).mock.calls.length).toBe(initial)

    setHidden(false)
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(vi.mocked(getTodayHub).mock.calls.length).toBeGreaterThan(initial)

    wrapper.unmount()
  })
})
