import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

import ParentLayout from '@/parent/layouts/ParentLayout.vue'
import { _resetLineClientForTests, markLineClientFromSdk } from '@/parent/utils/lineClient'

/**
 * SPEC-020 CT-M-01：LINE MINI App 的內建 header 不可隱藏，且已提供標題、
 * 返回鈕與關閉鈕。家長端自畫的 M3TopAppBar 提供的三件事（標題／返回／`/me` 入口）
 * 在 LINE 內全部重複，其中 `/me` 更已是底部 tab 之一。
 *
 * 因此在 LINE App 內必須整條不渲染，否則首屏被兩條標題列吃掉。
 * 外部瀏覽器（含桌機測試）不受影響，仍是唯一的導覽列。
 */

vi.mock('@/parent/api/announcements', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
}))

const ORIGINAL_UA = navigator.userAgent

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

function makeRouter(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/home',
        name: 'parent-home',
        meta: { tab: 'home', title: '首頁' },
        component: { template: '<div/>' },
      },
      {
        path: '/fees',
        name: 'parent-fees',
        meta: { tab: 'admin', title: '繳費' },
        component: { template: '<div/>' },
      },
      {
        path: '/fees/:id',
        name: 'parent-fee-detail',
        meta: { tab: 'admin', title: '繳費明細', showBack: true },
        component: { template: '<div/>' },
      },
      {
        path: '/login',
        name: 'parent-login',
        meta: { public: true, hideTabBar: true },
        component: { template: '<div/>' },
      },
    ],
  })
  router.push(initialPath)
  return router
}

async function mountLayout(initialPath: string) {
  setActivePinia(createPinia())
  const router = makeRouter(initialPath)
  await router.isReady()
  const wrapper = mount(ParentLayout, {
    global: {
      plugins: [router],
      stubs: {
        M3TopAppBar: {
          template:
            '<header data-test="top-app-bar"><slot name="leading" /><span>{{ title }}</span><slot name="actions" /></header>',
          props: ['title', 'showBack', 'onBack', 'variant'],
        },
        M3NavigationBar: { template: '<nav data-test="nav-bar" />' },
        ConnectionBanner: true,
        ParentOfflineIndicator: true,
        BrandMark: { template: '<span data-test="brand-mark" />', props: ['variant', 'size'] },
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  _resetLineClientForTests()
  setUserAgent(ORIGINAL_UA)
})

afterEach(() => {
  _resetLineClientForTests()
  setUserAgent(ORIGINAL_UA)
})

describe('ParentLayout 在 LINE App 內不渲染自畫 header', () => {
  it.each([['/fees'], ['/fees/1']])(
    'LINE 內的 %s 不得出現 M3TopAppBar（避免與 MINI App 內建 header 疊成雙標題列）',
    async (path) => {
      markLineClientFromSdk(true)
      const { wrapper } = await mountLayout(path)
      expect(wrapper.find('[data-test="top-app-bar"]').exists()).toBe(false)
      wrapper.unmount()
    },
  )

  it.each([['/fees'], ['/fees/1']])(
    '外部瀏覽器的 %s 仍必須有 M3TopAppBar（此時它是唯一導覽列）',
    async (path) => {
      markLineClientFromSdk(false)
      const { wrapper } = await mountLayout(path)
      expect(wrapper.find('[data-test="top-app-bar"]').exists()).toBe(true)
      wrapper.unmount()
    },
  )

  it('SDK 未就緒時以 User-Agent 判斷：LINE WebView 的 UA 一樣不渲染 header', async () => {
    setUserAgent('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Line/14.2.1 LIAPP')
    const { wrapper } = await mountLayout('/fees')
    expect(wrapper.find('[data-test="top-app-bar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('底部導覽列在 LINE 內必須保留（MINI App header 不提供分頁切換）', async () => {
    markLineClientFromSdk(true)
    const { wrapper } = await mountLayout('/fees')
    expect(wrapper.find('[data-test="nav-bar"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('LINE 內的主內容區必須套用 no-topbar 版面補償', async () => {
    markLineClientFromSdk(true)
    const { wrapper } = await mountLayout('/fees')
    expect(wrapper.find('main').classes()).toContain('no-topbar')
    wrapper.unmount()
  })

  it('首頁本來就沒有 top bar，LINE 內外行為一致', async () => {
    markLineClientFromSdk(false)
    const { wrapper } = await mountLayout('/home')
    expect(wrapper.find('[data-test="top-app-bar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('公開頁（/login）在 LINE 內外都不渲染 header 與 tab bar', async () => {
    markLineClientFromSdk(true)
    const { wrapper } = await mountLayout('/login')
    expect(wrapper.find('[data-test="top-app-bar"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="nav-bar"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
