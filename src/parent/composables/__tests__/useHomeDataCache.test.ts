/**
 * invalidateHomeSummary（2026-10-14）：家長簽收通知、填調查、簽入學文件後，
 * 待辦清單與 tab 徽章不能再掛著舊數字等 60 秒 TTL。
 *
 * 用真的 useCachedAsync（不 mock），掛真的元件當 consumer：
 *  - 掛載中的 consumer（ParentLayout 徽章＋頁面）全部一起更新、只打一次請求、
 *    中途不被清成 null（徽章不閃成 0）
 *  - 沒掛載的 consumer 下次掛載時強制重抓，不吃 TTL 內的舊快取
 *  - 失效前就已在飛的舊請求，結果不算數，會再抓一次
 *  - 入學文件來源（useParentTodos）一起失效
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const getHomeSummary = vi.fn()
const listMySignRequests = vi.fn()
const listPickupAuthorizations = vi.fn()
vi.mock('@/parent/api/profile', () => ({ getHomeSummary: () => getHomeSummary() }))
vi.mock('@/parent/api/signDocuments', () => ({ listMySignRequests: () => listMySignRequests() }))
vi.mock('@/parent/api/pickup', () => ({
  listPickupAuthorizations: (...a: unknown[]) => listPickupAuthorizations(...a),
}))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import { invalidateHomeSummary, useHomeSummary } from '@/parent/composables/useHomeSummary'
import { _resetHomeDataCacheForTesting } from '@/parent/composables/useHomeDataCache'
import { useParentTodos } from '@/parent/composables/useParentTodos'

function summaryResponse(pendingEventAcks: number) {
  return { data: { summary: { pending_event_acks: pendingEventAcks } } }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

type BadgeVm = { badge: number; refresh: (force?: boolean) => Promise<unknown> }

/** 模擬 ParentLayout／頁面：掛著 useHomeSummary 讀徽章 */
function mountBadgeConsumer(): VueWrapper {
  return mount(defineComponent({
    setup() {
      const { adminTabBadge, refresh } = useHomeSummary()
      return { badge: adminTabBadge, refresh }
    },
    render: () => h('div'),
  }))
}

const vmOf = (w: VueWrapper) => w.vm as unknown as BadgeVm

const mounted: VueWrapper[] = []
function track(w: VueWrapper): VueWrapper {
  mounted.push(w)
  return w
}

beforeEach(() => {
  _resetCacheForTesting()
  _resetHomeDataCacheForTesting()
  vi.resetAllMocks()
  listMySignRequests.mockResolvedValue({ data: { pending: [], signed: [] } })
  listPickupAuthorizations.mockResolvedValue({ data: { items: [] } })
})

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
})

describe('invalidateHomeSummary', () => {
  it('掛載中的徽章與頁面一起更新、只打一次請求，過程中不被清成 null', async () => {
    getHomeSummary.mockResolvedValueOnce(summaryResponse(2))
    const layout = track(mountBadgeConsumer())
    const page = track(mountBadgeConsumer())
    await flushPromises()
    expect(getHomeSummary).toHaveBeenCalledTimes(1)
    expect(vmOf(layout).badge).toBe(2)

    const next = deferred<ReturnType<typeof summaryResponse>>()
    getHomeSummary.mockReturnValueOnce(next.promise)
    const done = invalidateHomeSummary()
    await Promise.resolve()
    // 重抓中：舊數字留著，不閃成 0
    expect(vmOf(layout).badge).toBe(2)

    next.resolve(summaryResponse(1))
    await done
    await flushPromises()
    expect(getHomeSummary).toHaveBeenCalledTimes(2)
    expect(vmOf(layout).badge).toBe(1)
    expect(vmOf(page).badge).toBe(1)
  })

  it('失效當下沒有人掛著：下一次掛載強制重抓，不吃 TTL 內的舊快取', async () => {
    getHomeSummary.mockResolvedValueOnce(summaryResponse(3))
    const first = mountBadgeConsumer()
    await flushPromises()
    first.unmount()

    await invalidateHomeSummary()
    expect(getHomeSummary).toHaveBeenCalledTimes(1)

    getHomeSummary.mockResolvedValueOnce(summaryResponse(0))
    const again = track(mountBadgeConsumer())
    await flushPromises()
    expect(getHomeSummary).toHaveBeenCalledTimes(2)
    expect(vmOf(again).badge).toBe(0)
  })

  it('沒有失效時，TTL 內重新掛載照舊吃快取（不增加請求）', async () => {
    getHomeSummary.mockResolvedValueOnce(summaryResponse(3))
    const first = mountBadgeConsumer()
    await flushPromises()
    first.unmount()
    const again = track(mountBadgeConsumer())
    await flushPromises()
    expect(getHomeSummary).toHaveBeenCalledTimes(1)
    expect(vmOf(again).badge).toBe(3)
  })

  it('失效前就已在飛的請求結果不算數，會再抓一次', async () => {
    getHomeSummary.mockResolvedValueOnce(summaryResponse(2))
    const layout = track(mountBadgeConsumer())
    await flushPromises()

    // 換頁觸發的刷新（強制）還在飛，家長在這期間完成了簽收
    const stale = deferred<ReturnType<typeof summaryResponse>>()
    getHomeSummary.mockReturnValueOnce(stale.promise)
    void vmOf(layout).refresh(true)
    await Promise.resolve()

    getHomeSummary.mockResolvedValueOnce(summaryResponse(1))
    const done = invalidateHomeSummary()
    stale.resolve(summaryResponse(2)) // 失效前發出的請求：伺服器還沒算進剛才的簽收
    await done
    await flushPromises()

    expect(getHomeSummary).toHaveBeenCalledTimes(3)
    expect(vmOf(layout).badge).toBe(1)
  })

  it('入學文件來源（useParentTodos）一起失效：簽完文件後「簽署入學文件」列立即消失', async () => {
    getHomeSummary.mockResolvedValue(summaryResponse(0))
    listMySignRequests.mockResolvedValueOnce({ data: { pending: [{ id: 1 }], signed: [] } })
    const todosHost = track(mount(defineComponent({
      setup() {
        const { todos } = useParentTodos()
        return { todos }
      },
      render: () => h('div'),
    })))
    await flushPromises()
    const keys = () => ((todosHost.vm as unknown as { todos: { key: string }[] }).todos).map((t) => t.key)
    expect(keys()).toContain('signDocs')

    listMySignRequests.mockResolvedValueOnce({ data: { pending: [], signed: [{ id: 1 }] } })
    await invalidateHomeSummary()
    await flushPromises()
    expect(keys()).not.toContain('signDocs')
  })
})
