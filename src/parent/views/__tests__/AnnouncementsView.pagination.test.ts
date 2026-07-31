/**
 * AnnouncementsView — 分頁載入 + 未讀數一致性。
 *
 * 背景：
 * 1. 舊行為只打一次 `listAnnouncements({ limit: 50 })`，超過 50 則的舊公告
 *    永遠看不到——`useIncrementalRender` 只是前端把「已抓到的資料」漸進渲染
 *    出來，不會向後端要更多。這裡改成：本地漸進渲染的批次全部揭露完
 *    （useIncrementalRender 的 hasMore 轉 false）且後端還有更多
 *    （items.length < total）時，自動抓下一頁（skip=已載入筆數）並「附加」
 *    進 items（不能整批取代，否則使用者已展開的捲動進度會被打回原點）。
 * 2. 舊的未讀數是 `items.filter(x => !x.is_read).length`，只算「目前已載入
 *    的這一批」，跟 ParentLayout 用的後端全量 `/announcements/unread-count`
 *    對不上。改成一律以後端權威值為準。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const { mockListAnnouncements, mockGetUnreadCount, mockMarkRead } = vi.hoisted(() => ({
  mockListAnnouncements: vi.fn(),
  mockGetUnreadCount: vi.fn(),
  mockMarkRead: vi.fn(),
}))

vi.mock('@/parent/api/announcements', () => ({
  listAnnouncements: mockListAnnouncements,
  getUnreadCount: mockGetUnreadCount,
  markRead: mockMarkRead,
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import AnnouncementsView from '../AnnouncementsView.vue'

const STUBS = {
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
  SkeletonBlock: true,
  EmptyState: true,
  KawaiiStar: true,
  AnnouncementDetailModal: true,
}

function makeItem(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    priority: 'normal',
    is_read: false,
    created_at: '2026-01-01 10:00',
    title: `公告 ${id}`,
    ...overrides,
  }
}

let observerCallback: IntersectionObserverCallback | null = null

beforeEach(() => {
  observerCallback = null
  // @ts-expect-error test stub：捕捉 useIncrementalRender 建立的 observer callback，
  // 讓測試可以主動「觸底」而不用真的模擬捲動。
  global.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      observerCallback = cb
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  mockListAnnouncements.mockReset()
  mockGetUnreadCount.mockReset().mockResolvedValue({ data: { unread_count: 0 } })
  mockMarkRead.mockReset().mockResolvedValue({ data: {} })
})

function triggerIntersect() {
  observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
}

async function scrollToLocalEnd() {
  // pageSize=20，初始 50 筆需要 3 次觸底才會讓 useIncrementalRender 的
  // hasMore 轉 false（20 → 40 → 60，slice 會被實際陣列長度夾住）。
  for (let i = 0; i < 3; i++) {
    triggerIntersect()
    await nextTick()
  }
  await flushPromises()
}

describe('AnnouncementsView — 分頁載入', () => {
  it('初始請求帶 limit:50（不帶 skip）', async () => {
    mockListAnnouncements.mockResolvedValueOnce({ data: { items: [makeItem(1)], total: 1 } })
    mount(AnnouncementsView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(mockListAnnouncements).toHaveBeenCalledWith({ limit: 50 })
  })

  it('本地批次揭露完且後端還有更多 → 自動抓下一頁（skip=已載入筆數）並附加，不是取代', async () => {
    const firstBatch = Array.from({ length: 50 }, (_, i) => makeItem(i + 1))
    const secondBatch = Array.from({ length: 10 }, (_, i) => makeItem(51 + i))
    mockListAnnouncements
      .mockResolvedValueOnce({ data: { items: firstBatch, total: 60 } })
      .mockResolvedValueOnce({ data: { items: secondBatch, total: 60 } })

    const wrapper = mount(AnnouncementsView, { global: { stubs: STUBS } })
    await flushPromises()

    await scrollToLocalEnd()

    expect(mockListAnnouncements).toHaveBeenNthCalledWith(2, { limit: 50, skip: 50 })
    // 附加後應該看得到超過原本 50 筆（第一批漸進渲染 + 第二批進來後繼續漸進）
    expect(wrapper.findAll('.ann-card').length).toBeGreaterThan(50)
  })

  it('後端已無更多（total === 已載入筆數）→ 觸底不再打第二次 API，顯示「沒有更多」', async () => {
    const items = Array.from({ length: 30 }, (_, i) => makeItem(i + 1))
    mockListAnnouncements.mockResolvedValueOnce({ data: { items, total: 30 } })

    const wrapper = mount(AnnouncementsView, { global: { stubs: STUBS } })
    await flushPromises()

    await scrollToLocalEnd()

    expect(mockListAnnouncements).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="ann-no-more"]').exists()).toBe(true)
  })

  it('抓下一頁時顯示「載入更多中」狀態', async () => {
    const firstBatch = Array.from({ length: 50 }, (_, i) => makeItem(i + 1))
    let resolveSecond: (v: unknown) => void = () => {}
    mockListAnnouncements
      .mockResolvedValueOnce({ data: { items: firstBatch, total: 60 } })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))

    const wrapper = mount(AnnouncementsView, { global: { stubs: STUBS } })
    await flushPromises()

    for (let i = 0; i < 3; i++) {
      triggerIntersect()
      await nextTick()
    }
    await flushPromises()
    expect(wrapper.find('[data-testid="ann-loading-more"]').exists()).toBe(true)

    resolveSecond({ data: { items: [], total: 60 } })
    await flushPromises()
    expect(wrapper.find('[data-testid="ann-loading-more"]').exists()).toBe(false)
  })
})

describe('AnnouncementsView — 未讀數以後端權威值為準', () => {
  it('顯示的未讀數來自 getUnreadCount()，不是本地 items 計算值', async () => {
    // 本地全部已讀（filter 算出來會是 0），但後端說分頁外還有 12 則未讀
    const items = Array.from({ length: 5 }, (_, i) => makeItem(i + 1, { is_read: true }))
    mockListAnnouncements.mockResolvedValueOnce({ data: { items, total: 5 } })
    mockGetUnreadCount.mockResolvedValueOnce({ data: { unread_count: 12 } })

    const wrapper = mount(AnnouncementsView, { global: { stubs: STUBS } })
    await flushPromises()

    expect(wrapper.text()).toContain('12')
  })

  it('標記已讀成功後未讀數本地遞減（樂觀更新，仍源自後端初始值）', async () => {
    const items = [makeItem(1, { is_read: false })]
    mockListAnnouncements.mockResolvedValueOnce({ data: { items, total: 1 } })
    mockGetUnreadCount.mockResolvedValueOnce({ data: { unread_count: 3 } })

    const wrapper = mount(AnnouncementsView, { global: { stubs: STUBS } })
    await flushPromises()
    expect(wrapper.text()).toContain('3')

    await wrapper.find('.ann-card').trigger('click')
    await flushPromises()

    expect(mockMarkRead).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('2')
  })
})
