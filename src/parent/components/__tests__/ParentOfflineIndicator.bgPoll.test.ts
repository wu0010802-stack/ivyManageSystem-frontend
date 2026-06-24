import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import 'fake-indexeddb/auto'
import ElementPlus from 'element-plus'

// F6：家長離線 indicator 5s 輪詢於背景分頁（document.hidden）時應跳過。
vi.mock('@/parent/stores/parentAuth', () => ({
  useParentAuthStore: vi.fn(),
}))

vi.mock('@/parent/utils/parentOfflineQueue', async () => {
  const actual = await vi.importActual<typeof import('@/parent/utils/parentOfflineQueue')>('@/parent/utils/parentOfflineQueue')
  return { ...actual, flushAllParent: vi.fn().mockResolvedValue({ succeeded: 0, needs_review: 0, kept: 0, auth_failed: false }) }
})

// listOps 是 refresh 內每個 PARENT_KIND 都會呼叫的 IO；以它的呼叫次數判斷輪詢是否發生
vi.mock('@/utils/offlineQueue', async () => {
  const actual = await vi.importActual<typeof import('@/utils/offlineQueue')>('@/utils/offlineQueue')
  return { ...actual, listOps: vi.fn(() => Promise.resolve([])) }
})

import ParentOfflineIndicator from '../ParentOfflineIndicator.vue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { listOps } from '@/utils/offlineQueue'

function setHidden(val: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => val })
}

describe('ParentOfflineIndicator 背景分頁輪詢暫停（F6）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    setHidden(false)
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as unknown as ReturnType<typeof useParentAuthStore>)
    vi.mocked(listOps).mockResolvedValue([])
  })
  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
  })

  it('分頁隱藏時 5s 輪詢不呼叫 listOps', async () => {
    mount(ParentOfflineIndicator, { global: { plugins: [ElementPlus] } })
    await vi.advanceTimersByTimeAsync(0) // onMounted 首載 refresh
    const initial = vi.mocked(listOps).mock.calls.length
    expect(initial).toBeGreaterThan(0)

    setHidden(true)
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.mocked(listOps).mock.calls.length).toBe(initial)

    setHidden(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.mocked(listOps).mock.calls.length).toBeGreaterThan(initial)
  })
})
