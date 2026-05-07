import { describe, it, expect } from 'vitest'
import { createRouter, createWebHashHistory } from 'vue-router'

// 直接重建 router 結構測 catch-all redirect target；不引 main.js（避免 pinia 初始化）
function buildRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', redirect: '/home' },
      { path: '/login', name: 'parent-login', component: { template: '<div/>' }, meta: { public: true } },
      { path: '/home', name: 'parent-home', component: { template: '<div/>' }, meta: { tab: 'home' } },
      // catch-all 由 plan 改寫
      { path: '/:pathMatch(.*)*', redirect: '/home' },
    ],
  })
}

describe('router catch-all', () => {
  it('未知路徑 → /home（不再導 /login）', async () => {
    const router = buildRouter()
    await router.push('/some-typo-url')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/home')
  })
})

describe('router meta.tab — IA v2 Phase 3 深層頁高亮對應 tab', () => {
  it('每個深層頁都有 meta.tab，且為四個 tab key 之一', async () => {
    // 動態載入真實 router 以拿到完整 routes
    const { default: router } = await import('@/parent/router')
    const routes = router.options.routes

    const validTabs = new Set(['home', 'messages', 'family', 'me'])

    // Phase 3 起，所有深層頁都應有 meta.tab，使對應 tab 高亮
    const deepPaths = [
      '/leaves',
      '/fees',
      '/events',
      '/events/:eventId/ack',
      '/medications',
      '/medications/new',
      '/medications/:id',
      '/activity',
      '/calendar',
      '/contact-book',
      '/contact-book/:entryId',
      '/children/:studentId',
      '/bind-additional',
      '/notifications/preferences',
    ]
    for (const p of deepPaths) {
      const r = routes.find((x) => x.path === p)
      expect(r, `route ${p} not found`).toBeTruthy()
      expect(r.meta?.tab, `${p} 應有 meta.tab`).toBeDefined()
      expect(validTabs.has(r.meta.tab), `${p} meta.tab=${r.meta.tab} 須為 4 tab key 之一`).toBe(true)
    }

    // 主 tab 路由仍保留 tab
    const tabPaths = ['/home', '/attendance', '/announcements', '/messages', '/messages/:threadId', '/me']
    for (const p of tabPaths) {
      const r = routes.find((x) => x.path === p)
      expect(r.meta?.tab, `${p} 應保留 meta.tab`).toBeDefined()
    }
  })
})
