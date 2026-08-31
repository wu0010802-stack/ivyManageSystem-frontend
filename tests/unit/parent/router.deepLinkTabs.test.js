import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'

async function buildRouter() {
  const mod = await import('@/parent/router.js')
  const routes = mod.default.options.routes
  return createRouter({ history: createMemoryHistory(), routes })
}

// IA v3（2026-05-22）：4 tab = home / messages / admin / me（family 砍掉）
// P2（2026-08-14）：擴充為 5 tab，新增 child——聯絡簿改歸屬孩子 hub。
// 2026-08-28：訊息功能下架，第三個 tab 換成聯絡簿；公告併入聯絡簿頁的第二分頁，
// 故 /contact-book 與 /announcements 一律歸 tab='contact-book'。
// 對映規則見 docs/superpowers/specs/2026-08-14-parent-liff-m3-expressive-redesign-design.md §7
describe('parent router IA v3+P2 — deep-link tab association', () => {
  it.each([
    ['/home', 'home'],
    ['/contact-book', 'contact-book'],
    ['/contact-book/1', 'contact-book'],
    ['/calendar', 'home'],
    ['/announcements', 'contact-book'],
    ['/admin', 'admin'],
    ['/leaves', 'admin'],
    ['/fees', 'admin'],
    ['/medications', 'admin'],
    ['/activity', 'admin'],
    ['/events', 'admin'],
    ['/attendance', 'admin'],
    ['/me', 'me'],
    ['/notifications/preferences', 'me'],
    ['/bind-additional', 'me'],
    ['/children/1', 'child'],
  ])('深層頁 %s 對應 tab %s', async (path, expectedTab) => {
    const router = await buildRouter()
    await router.push(path)
    expect(router.currentRoute.value.meta.tab).toBe(expectedTab)
  })

  // 訊息下架後舊路徑仍可能出現在 LINE 推播的既有深連結裡，必須 redirect
  // 到聯絡簿而不是落到 catch-all（catch-all 會把人丟回首頁，失去脈絡）。
  it.each([
    ['/messages'],
    ['/messages/123'],
  ])('舊訊息路徑 %s redirect 到 /contact-book', async (path) => {
    const router = await buildRouter()
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/contact-book')
  })
})
