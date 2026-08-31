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

// IA v3（2026-05-22）將 4 tab 重組為 home/messages/admin/me（family 砍掉）；
// P2（2026-08-14 M3 Expressive 改版）新增「孩子」hub，擴充為 5 tab，
// 白名單同步加入 child——見 docs/superpowers/specs/2026-08-14-parent-liff-m3-expressive-redesign-design.md §7
// 2026-08-28：訊息自家長端下架，messages tab 換成 contact-book。
describe('router meta.tab — IA v3+P2 深層頁高亮對應 tab', () => {
  it('每個深層頁都有 meta.tab，且為五個 tab key 之一', async () => {
    const { default: router } = await import('@/parent/router')
    const routes = router.options.routes

    const validTabs = new Set(['home', 'contact-book', 'admin', 'me', 'child'])

    // IA v3 後，所有深層頁都應有 meta.tab；assistant 因走 modal 不需 tab
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
      expect(validTabs.has(r.meta.tab), `${p} meta.tab=${r.meta.tab} 須為五個 tab key 之一`).toBe(true)
    }

    const tabPaths = ['/home', '/attendance', '/announcements', '/contact-book', '/me', '/admin', '/child']
    for (const p of tabPaths) {
      const r = routes.find((x) => x.path === p)
      expect(r.meta?.tab, `${p} 應保留 meta.tab`).toBeDefined()
    }
  })
})
