// 資安回歸（2026-08-17 資安稽核 SEC-24）：
// 家長端離線佇列（IndexedDB `ivy-offline`）存的是尚未送出的請假／親師訊息
// payload——含病名與訊息全文。登出流程原本完全不碰它，PII 會留在共用裝置。
//
// 修法刻意**不是** `clearAll()`：佇列裡只會有 pending / needs_review 兩種
// 狀態（成功送出即 `removeOp`），無差別清除等同把家長離線寫的資料弄丟。
// 改為「登出前先嘗試送出」——送成功的 op 自然被移除，PII 不殘留也不遺失；
// 送不出去的（離線／403／重試耗盡）仍保留，「不遺失」優先於「不殘留」，
// 與 offlineQueue.ts 檔頭 CT-F-06 的既有取捨一致。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { mockLiff, mockLogout, mockFlushAll, mockResetRuntime, mockListOpsForKinds } = vi.hoisted(
  () => ({
    mockLiff: { isLoggedIn: vi.fn(() => false), logout: vi.fn() },
    mockLogout: vi.fn(),
    mockFlushAll: vi.fn(),
    mockResetRuntime: vi.fn(),
    mockListOpsForKinds: vi.fn(),
  }),
)
vi.mock('@/parent/services/liff', () => ({ liff: mockLiff }))
vi.mock('@/parent/api/auth', () => ({ logout: mockLogout }))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({
  flushAllParent: mockFlushAll,
  resetParentOfflineQueueRuntime: mockResetRuntime,
  PARENT_KINDS: ['parent_leave', 'parent_message'],
}))
vi.mock('@/utils/offlineQueue', () => ({ listOpsForKinds: mockListOpsForKinds }))

import {
  performParentLogout,
  _resetParentLogoutIsolationForTesting,
  LOGOUT_FLUSH_TIMEOUT_MS,
} from '@/parent/composables/useParentLogout'
import { useParentAuthStore } from '@/parent/stores/parentAuth'

/** 讓 listOpsForKinds 回報「有 / 沒有」待送出的 op。 */
function stubQueue(pendingCount: number) {
  const group = {
    pending: Array.from({ length: pendingCount }, (_, i) => ({ id: `op-${i}` })),
    needs_review: [],
  }
  mockListOpsForKinds.mockResolvedValue({
    parent_leave: group,
    parent_message: { pending: [], needs_review: [] },
  })
}

beforeEach(() => {
  _resetParentLogoutIsolationForTesting()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockFlushAll.mockResolvedValue({ succeeded: 0, kept: 0, needs_review: 0, auth_failed: false })
  mockLogout.mockResolvedValue(undefined)
  stubQueue(0)
  useParentAuthStore().setUser({ user_id: 42 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('performParentLogout：登出前先送出離線佇列（SEC-24）', () => {
  it('佇列有待送出資料時會先送出，且在呼叫後端 logout 之前', async () => {
    stubQueue(2)
    const order: string[] = []
    mockFlushAll.mockImplementation(async () => {
      order.push('flush')
      return { succeeded: 2, kept: 0, needs_review: 0, auth_failed: false }
    })
    mockLogout.mockImplementation(async () => {
      order.push('logout')
    })

    await performParentLogout()

    expect(mockFlushAll).toHaveBeenCalledTimes(1)
    // 順序很重要：後端 logout 之後 cookie 失效，佇列就再也送不出去（401）
    expect(order).toEqual(['flush', 'logout'])
  })

  it('佇列是空的就完全不觸發 flush（避免為了空佇列多等 1 秒 debounce）', async () => {
    stubQueue(0)

    await performParentLogout()

    expect(mockFlushAll).not.toHaveBeenCalled()
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('送出失敗（離線）時仍完成登出，且不清空佇列', async () => {
    stubQueue(1)
    mockFlushAll.mockRejectedValue(new Error('Network Error'))

    await expect(performParentLogout()).resolves.toBeUndefined()

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('送出卡住時不阻斷登出（有 timeout 上限）', async () => {
    stubQueue(1)
    mockFlushAll.mockImplementation(() => new Promise(() => {}))
    vi.useFakeTimers()

    const done = vi.fn()
    const p = performParentLogout().then(done)

    await vi.advanceTimersByTimeAsync(LOGOUT_FLUSH_TIMEOUT_MS + 50)
    await p

    expect(done).toHaveBeenCalled()
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('查詢佇列本身失敗時不阻斷登出', async () => {
    mockListOpsForKinds.mockRejectedValue(new Error('IndexedDB unavailable'))

    await expect(performParentLogout()).resolves.toBeUndefined()

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })
})
