import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import ParentLayout from '@/parent/layouts/ParentLayout.vue'

/**
 * Bug Sweep Round 4 (2026-05-14) F-FE-3：家長端主分頁必須在 M3TopAppBar
 * leading slot 渲染 BrandMark。舊 AppHeader 在 !displayShowBack 時顯示
 * BrandMark；M3 改造後沒搬上 leading slot，4 個主分頁（home/messages/
 * family/me）變空白。CLAUDE.md polish 階段 acceptance 列為「保留
 * LaurelWreath/CrownIcon brand」。
 */

vi.mock('@/parent/api/announcements', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
}))
vi.mock('@/parent/api/messages', () => ({
  getMessageUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
}))

function makeRouter(initialPath, meta = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/home',
        name: 'h',
        meta: { tab: 'home', title: '首頁', ...meta },
        component: { template: '<div/>' },
      },
      {
        path: '/messages',
        name: 'm',
        meta: { tab: 'messages', title: '訊息' },
        component: { template: '<div/>' },
      },
      {
        path: '/messages/:id',
        name: 'mt',
        meta: { tab: 'messages', title: '訊息詳情', showBack: true },
        component: { template: '<div/>' },
      },
      {
        path: '/family',
        name: 'f',
        meta: { tab: 'family', title: '家庭' },
        component: { template: '<div/>' },
      },
      {
        path: '/me',
        name: 'me',
        meta: { tab: 'me', title: '我' },
        component: { template: '<div/>' },
      },
    ],
  })
  router.push(initialPath)
  return router
}

async function mountLayout(initialPath) {
  setActivePinia(createPinia())
  const router = makeRouter(initialPath)
  await router.isReady()
  const wrapper = mount(ParentLayout, {
    global: {
      plugins: [router],
      stubs: {
        // 用 functional stub 暴露 leading slot，方便斷言內容
        M3TopAppBar: {
          template: '<header class="m3-top-app-bar"><slot name="leading" /><span class="title">{{ title }}</span></header>',
          props: ['title', 'showBack', 'onBack', 'variant'],
        },
        M3NavigationBar: true,
        ConnectionBanner: true,
        // BrandMark 用 stub 並輸出 data-test 方便定位
        BrandMark: {
          template: '<span data-test="brand-mark" :data-variant="variant" :data-size="size" />',
          props: ['variant', 'size'],
        },
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('ParentLayout BrandMark in M3TopAppBar leading', () => {
  it.each([['/home'], ['/messages'], ['/family'], ['/me']])(
    '主分頁 %s 必須有 BrandMark mini',
    async (path) => {
      const { wrapper } = await mountLayout(path)
      const brand = wrapper.find('[data-test="brand-mark"]')
      expect(brand.exists()).toBe(true)
      expect(brand.attributes('data-variant')).toBe('mini')
      wrapper.unmount()
    },
  )

  it('深層頁（showBack=true）不渲染 BrandMark，避免擠在 back button 旁', async () => {
    const { wrapper } = await mountLayout('/messages/123')
    const brand = wrapper.find('[data-test="brand-mark"]')
    expect(brand.exists()).toBe(false)
    wrapper.unmount()
  })
})
