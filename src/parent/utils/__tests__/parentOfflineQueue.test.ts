import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// fake IndexedDB
import 'fake-indexeddb/auto'

// vi.mock hoisted — define single mock at top level, control return via mockReturnValue per test
vi.mock('@/parent/stores/parentAuth', () => ({
  useParentAuthStore: vi.fn(),
}))

import {
  enqueueParent,
  flushParentQueue,
} from '../parentOfflineQueue'
import { OP_KINDS, clearAll } from '@/utils/offlineQueue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'

describe('parentOfflineQueue', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    // 清 IndexedDB 所有 pending ops
    await clearAll()
    vi.resetAllMocks()
  })

  it('enqueueParent 自動注入 client_request_id (UUID v4 格式)', async () => {
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 42 } } as ReturnType<typeof useParentAuthStore>)
    const op = await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { thread_id: 1, content: 'hi' },
    })
    expect((op.payload as Record<string, unknown>).client_request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it('enqueueParent 從 parentAuth 拿 user_id 當 partition key', async () => {
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 99 } } as ReturnType<typeof useParentAuthStore>)
    const op = await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    expect(op.user_id).toBe(99)
  })

  it('flushParentQueue 200 → removeOp succeeded++', async () => {
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as ReturnType<typeof useParentAuthStore>)
    const saveFn = vi.fn().mockResolvedValue({ data: { id: 1 } })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    const result = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
    expect(result.succeeded).toBe(1)
    expect(result.kept).toBe(0)
  })

  it('未登入或 user_id 缺失時 fail-closed，不列出也不送出任何 op', async () => {
    vi.mocked(useParentAuthStore).mockReturnValue({ user: null } as ReturnType<typeof useParentAuthStore>)
    const saveFn = vi.fn().mockResolvedValue({ data: { id: 1 } })

    const result = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)

    expect(saveFn).not.toHaveBeenCalled()
    expect(result).toEqual({
      succeeded: 0,
      needs_review: 0,
      kept: 0,
      auth_failed: false,
    })
  })

  it('flush 每筆送出前重新核對 owner，切換帳號後不得續送前一位家長的 op', async () => {
    const authState: { user: { user_id: number } | null } = { user: { user_id: 7 } }
    vi.mocked(useParentAuthStore).mockReturnValue(authState as ReturnType<typeof useParentAuthStore>)
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'first' },
    })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'second' },
    })
    const saveFn = vi.fn().mockImplementation(async () => {
      authState.user = { user_id: 8 }
      return { data: { id: 1 } }
    })

    const result = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)

    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(result.succeeded).toBe(1)
    expect(result.kept).toBe(1)
  })

  it('flushParentQueue 409 視同成功（dedupe replay）', async () => {
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as ReturnType<typeof useParentAuthStore>)
    const saveFn = vi.fn().mockRejectedValue({
      response: { status: 409 },
    })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    const result = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
    expect(result.succeeded).toBe(1)
  })

  it('flushParentQueue 401 → auth_failed + break', async () => {
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as ReturnType<typeof useParentAuthStore>)
    const saveFn = vi.fn().mockRejectedValue({ response: { status: 401 } })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    const result = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
    expect(result.auth_failed).toBe(true)
    expect(result.kept).toBeGreaterThanOrEqual(1)
  })

  it('flushParentQueue 403 → needs_review', async () => {
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as ReturnType<typeof useParentAuthStore>)
    const saveFn = vi.fn().mockRejectedValue({
      response: { status: 403, data: { detail: 'forbidden' } },
    })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    const result = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
    expect(result.needs_review).toBe(1)
  })

  it('flushParentQueue 5xx attempts++ 累積 5 次標 needs_review', async () => {
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as ReturnType<typeof useParentAuthStore>)
    const saveFn = vi.fn().mockRejectedValue({ response: { status: 500 } })
    await enqueueParent({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'hi' },
    })
    // 第 1-4 次 kept
    for (let i = 0; i < 4; i++) {
      const r = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
      expect(r.kept).toBe(1)
    }
    // 第 5 次 needs_review
    const final = await flushParentQueue(OP_KINDS.PARENT_MESSAGE, saveFn)
    expect(final.needs_review).toBe(1)
  })
})
