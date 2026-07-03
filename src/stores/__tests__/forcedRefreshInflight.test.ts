import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

/**
 * Finding [3]（P3）：強制刷新在有 in-flight 請求時會回傳舊的「未強制」promise，
 * 導致簽核後徽章不即時更新（拿到簽核前的結果）。
 *
 * 同型缺陷存在於：
 *   - stores/notification.ts fetchSummary({ force: true })
 *   - stores/_createFetchStore.ts refresh() / fetch(true)
 */

vi.mock('@/api/notifications', () => ({
  getNotificationSummary: vi.fn(),
}))

import * as notificationsApi from '@/api/notifications'
import { useNotificationStore } from '../notification'
import { createFetchStore } from '../_createFetchStore'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

function makeDeferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('notification store — 強制刷新繞過 in-flight 去重', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('force=true 在有非強制 in-flight 時發新請求並取得最新結果', async () => {
    const first = makeDeferred<{ data: unknown }>()
    const second = Promise.resolve({
      data: { total_badge: 4, action_items: [{ type: 'approval', count: 4 }], reminders: [] },
    })
    asMock(notificationsApi.getNotificationSummary)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second)

    const store = useNotificationStore()

    const p1 = store.fetchSummary() // 非強制，in-flight（第一支）
    const p2 = store.fetchSummary({ force: true }) // 簽核後強制刷新，此時第一支仍在途

    // 第一支（簽核前）較晚回，count=5
    first.resolve({
      data: { total_badge: 5, action_items: [{ type: 'approval', count: 5 }], reminders: [] },
    })
    await p1
    await p2
    await flushPromises()

    // 強制刷新必須真的發第二支請求，最終落地簽核後的最新狀態
    expect(asMock(notificationsApi.getNotificationSummary)).toHaveBeenCalledTimes(2)
    expect(store.approvalCount).toBe(4)
  })
})

describe('_createFetchStore — refresh() 繞過 in-flight 去重', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('refresh() 在有 in-flight 時排隊重抓最新（不回舊 _pending）', async () => {
    const first = makeDeferred<{ data: unknown }>()
    const apiFn = vi.fn<() => Promise<{ data: unknown }>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(Promise.resolve({ data: [1, 2] }))

    const useStore = createFetchStore('forcedRefreshTestStore', apiFn, { dataKey: 'items' })
    const store = useStore() as unknown as {
      items: unknown[]
      fetch: () => Promise<void>
      refresh: () => Promise<void>
    }

    const p1 = store.fetch() // in-flight（第一支）
    const p2 = store.refresh() // force，此時第一支仍在途

    first.resolve({ data: [1] })
    await p1
    await p2
    await flushPromises()

    expect(apiFn).toHaveBeenCalledTimes(2)
    expect(store.items).toEqual([1, 2])
  })
})
