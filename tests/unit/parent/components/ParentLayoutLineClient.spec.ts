import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

import ParentLayout from '@/parent/layouts/ParentLayout.vue'
import { _resetLineClientForTests, markLineClientFromSdk } from '@/parent/utils/lineClient'

/**
 * SPEC-020 CT-M-01：LINE 的內建 header 不可隱藏，已提供標題（取自
 * document.title）與關閉鈕。家長端自畫 M3TopAppBar 的標題與 `/me` 入口在
 * LINE 內都是重複的（`/me` 更已是底部 tab 之一），兩條疊起來吃掉近 120px。
 *
 * 但**深層頁必須保留返回鈕**：LINE 內建 header 的返回鈕不是通用的「上一頁」
 * ——LIFF browser 只在 LIFF 之間轉場時才顯示它，MINI App 的 Return button
 * 也未保證在所有情境出現。整條隱藏會讓深層頁只剩底部 tab 可逃。
 *
 * 因此分流：LINE 內的主分頁整條不渲染；深層頁保留，但不重複顯示標題。
 * 外部瀏覽器（含桌機測試）不受影響，它仍是唯一導覽列且照常顯示標題。
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
            '<header data-test="top-app-bar" :data-title="title" :data-show-back="String(showBack)"><slot name="leading" /><span>{{ title }}</span><slot name="actions" /></header>',
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

describe('ParentLayout 在 LINE App 內的 header 分流', () => {
  it('LINE 內的主分頁不得出現 M3TopAppBar（避免與內建 header 疊成雙標題列）', async () => {
    markLineClientFromSdk(true)
    const { wrapper } = await mountLayout('/fees')
    expect(wrapper.find('[data-test="top-app-bar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('LINE 內的深層頁必須保留 header：內建返回鈕不是通用的「上一頁」', async () => {
    markLineClientFromSdk(true)
    const { wrapper } = await mountLayout('/fees/1')
    const bar = wrapper.find('[data-test="top-app-bar"]')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('data-show-back')).toBe('true')
    wrapper.unmount()
  })

  it('LINE 內的深層頁不重複顯示標題（內建 header 已在顯示 document.title）', async () => {
    markLineClientFromSdk(true)
    const { wrapper } = await mountLayout('/fees/1')
    expect(wrapper.find('[data-test="top-app-bar"]').attributes('data-title')).toBe('')
    wrapper.unmount()
  })

  it.each([['/fees'], ['/fees/1']])(
    '外部瀏覽器的 %s 仍必須有 M3TopAppBar（此時它是唯一導覽列）',
    async (path) => {
      markLineClientFromSdk(false)
      const { wrapper } = await mountLayout(path)
      expect(wrapper.find('[data-test="top-app-bar"]').exists()).toBe(true)
      wrapper.unmount()
    },
  )

  it('外部瀏覽器照常顯示標題', async () => {
    markLineClientFromSdk(false)
    const { wrapper } = await mountLayout('/fees/1')
    expect(wrapper.find('[data-test="top-app-bar"]').attributes('data-title')).toBe('繳費明細')
    wrapper.unmount()
  })

  it('SDK 未就緒時以 User-Agent 判斷：LINE WebView 的主分頁一樣不渲染 header', async () => {
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
