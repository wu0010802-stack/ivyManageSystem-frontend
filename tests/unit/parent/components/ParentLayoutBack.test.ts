import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouterHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

import ParentLayout from '@/parent/layouts/ParentLayout.vue'

/**
 * 頂部返回鍵（2026-10-14）：家長常從 LINE 推播深連結直接開詳情頁，瀏覽器分頁
 * 裡在 App 之前還有 LIFF 啟動頁、LINE OAuth 等站外紀錄。原本用
 * `window.history.length > 1` 判斷，會把這些站外紀錄當成「有上一頁」，按返回
 * 就退出 App 或被 LIFF 轉回同一頁。現在只認 vue-router 寫進 history.state 的
 * 站內 `back`；沒有就回到同分頁的上一層路由或分頁根頁（可用 meta.backTo 覆寫）。
 *
 * memory history 的 state 永遠是 {}，這裡以 getter 注入瀏覽器實際會有的 state。
 */

vi.mock('@/parent/api/announcements', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
}))

const stub = { template: '<div/>' }

function makeRouter(historyState: () => unknown) {
  const history: RouterHistory = createMemoryHistory()
  Object.defineProperty(history, 'state', { get: historyState, configurable: true })
  return createRouter({
    history,
    routes: [
      { path: '/home', name: 'parent-home', meta: { tab: 'home' }, component: stub },
      { path: '/contact-book', name: 'cb', meta: { tab: 'contact-book' }, component: stub },
      {
        path: '/contact-book/:entryId',
        name: 'cb-detail',
        meta: { tab: 'contact-book', showBack: true, title: '聯絡簿詳情' },
        component: stub,
      },
      { path: '/admin', name: 'admin', meta: { tab: 'admin' }, component: stub },
      { path: '/events', name: 'events', meta: { tab: 'admin', showBack: true }, component: stub },
      {
        path: '/events/:eventId/ack',
        name: 'event-ack',
        meta: { tab: 'admin', showBack: true, backTo: '/admin' },
        component: stub,
      },
      // 真實路由都有 name；ParentLayout 以 name 區分「有這一頁」與 catch-all／redirect
      { path: '/login', name: 'login', meta: { public: true, hideTabBar: true }, component: stub },
    ],
  })
}

async function mountAt(path: string, historyState: () => unknown) {
  setActivePinia(createPinia())
  const router = makeRouter(historyState)
  router.push(path)
  await router.isReady()
  const wrapper = mount(ParentLayout, {
    global: {
      plugins: [router],
      stubs: {
        M3TopAppBar: {
          template: '<header><button data-test="back" @click="onBack && onBack()">back</button></header>',
          props: ['title', 'showBack', 'onBack', 'variant'],
        },
        M3NavigationBar: { template: '<nav />' },
        ConnectionBanner: true,
        ParentOfflineIndicator: true,
        BrandMark: true,
      },
    },
  })
  await flushPromises()
  const back = vi.spyOn(router, 'back').mockImplementation(() => {})
  const replace = vi.spyOn(router, 'replace')
  return { wrapper, router, back, replace }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ParentLayout 返回鍵', () => {
  it('有站內上一頁 → router.back()', async () => {
    const { wrapper, back, replace } = await mountAt('/contact-book/9', () => ({
      back: '/contact-book',
      current: '/contact-book/9',
    }))
    await wrapper.find('[data-test="back"]').trigger('click')
    expect(back).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('推播深連結直接開詳情頁（無站內上一頁）→ 回到所屬分頁根頁，不呼叫 router.back()', async () => {
    const { wrapper, router, back } = await mountAt('/contact-book/9', () => ({
      back: null,
      current: '/contact-book/9',
    }))
    await wrapper.find('[data-test="back"]').trigger('click')
    await flushPromises()
    expect(back).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/contact-book')
    wrapper.unmount()
  })

  it('瀏覽器分頁裡有站外紀錄（history.length 很大）也不得退出 App', async () => {
    const lengthSpy = vi.spyOn(window.history, 'length', 'get').mockReturnValue(5)
    const { wrapper, router, back } = await mountAt('/events', () => ({ back: null }))
    await wrapper.find('[data-test="back"]').trigger('click')
    await flushPromises()
    expect(back).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/admin')
    lengthSpy.mockRestore()
    wrapper.unmount()
  })

  it('無 backTo 時回到同分頁的上一層路由（/contact-book/9 → /contact-book）', async () => {
    const { wrapper, router } = await mountAt('/contact-book/9', () => ({ back: null }))
    await wrapper.find('[data-test="back"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/contact-book')
    wrapper.unmount()
  })

  it('meta.backTo 覆寫上一層／分頁根頁', async () => {
    const { wrapper, router } = await mountAt('/events/3/ack', () => ({ back: null }))
    await wrapper.find('[data-test="back"]').trigger('click')
    await flushPromises()
    // 沒有 backTo 時會回上一層 /events；這裡 backTo 指定 /admin
    expect(router.currentRoute.value.path).toBe('/admin')
    wrapper.unmount()
  })

  it('上一頁是登入頁 → 不退回登入頁，改回分頁根頁', async () => {
    const { wrapper, router, back } = await mountAt('/events', () => ({ back: '/login' }))
    await wrapper.find('[data-test="back"]').trigger('click')
    await flushPromises()
    expect(back).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/admin')
    wrapper.unmount()
  })
})
