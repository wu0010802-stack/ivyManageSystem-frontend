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

// listOpsForKinds 是 refresh 內唯一的 IO（合併後一次 getAll，取代逐 kind×status 呼叫
// listOps 的 10 次全表掃描）；以它的呼叫次數判斷輪詢是否發生。
vi.mock('@/utils/offlineQueue', async () => {
  const actual = await vi.importActual<typeof import('@/utils/offlineQueue')>('@/utils/offlineQueue')
  return { ...actual, listOpsForKinds: vi.fn(() => Promise.resolve({})) }
})

import ParentOfflineIndicator from '../ParentOfflineIndicator.vue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { listOpsForKinds } from '@/utils/offlineQueue'
import { PARENT_KINDS } from '@/parent/utils/parentOfflineQueue'

function emptyGrouped() {
  return Object.fromEntries(PARENT_KINDS.map((k) => [k, { pending: [], needs_review: [] }]))
}

/** 佇列非空（維持 active 5s 節奏），第一個 kind 掛一筆 pending。 */
function nonEmptyGrouped() {
  const g = emptyGrouped()
  g[PARENT_KINDS[0]].pending = [{ id: 'x', kind: PARENT_KINDS[0] }]
  return g
}

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
    vi.mocked(listOpsForKinds).mockResolvedValue(emptyGrouped())
  })
  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
  })

  it('分頁隱藏時輪詢不呼叫 listOpsForKinds', async () => {
    // 用非空佇列維持 active 5s 節奏，才能真的測到「隱藏時該次 tick 被跳過」
    // ——若佇列全空，降頻後的 30s tick 本來就不會落在這個時間窗內，測不出回歸。
    vi.mocked(listOpsForKinds).mockResolvedValue(nonEmptyGrouped())
    mount(ParentOfflineIndicator, { global: { plugins: [ElementPlus] } })
    await vi.advanceTimersByTimeAsync(0) // onMounted 首載 refresh
    const initial = vi.mocked(listOpsForKinds).mock.calls.length
    expect(initial).toBeGreaterThan(0)

    setHidden(true)
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.mocked(listOpsForKinds).mock.calls.length).toBe(initial)

    setHidden(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.mocked(listOpsForKinds).mock.calls.length).toBeGreaterThan(initial)
  })

  it('refresh 合併成單次 listOpsForKinds 呼叫（帶全部 5 個 kind），取代逐 kind×status 呼叫', async () => {
    mount(ParentOfflineIndicator, { global: { plugins: [ElementPlus] } })
    await vi.advanceTimersByTimeAsync(0)

    expect(listOpsForKinds).toHaveBeenCalledTimes(1)
    expect(listOpsForKinds).toHaveBeenCalledWith({ kinds: PARENT_KINDS, userId: 7 })
  })

  it('佇列持續空 → 輪詢間隔從 5s 降頻到 30s', async () => {
    mount(ParentOfflineIndicator, { global: { plugins: [ElementPlus] } })
    await vi.advanceTimersByTimeAsync(0)
    expect(listOpsForKinds).toHaveBeenCalledTimes(1)

    // 第二次 tick 理應排在 30s（idle）而非 5s（active）後；5s 時不該再呼叫。
    await vi.advanceTimersByTimeAsync(5000)
    expect(listOpsForKinds).toHaveBeenCalledTimes(1)

    // 補滿到 30s 才觸發第二次。
    await vi.advanceTimersByTimeAsync(25000)
    expect(listOpsForKinds).toHaveBeenCalledTimes(2)
  })
})
