import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'

async function buildRouter() {
  const mod = await import('@/parent/router.js')
  const routes = mod.default.options.routes
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('parent router IA v2 — deep-link tab association', () => {
  it.each([
    ['/home', 'home'],
    ['/messages', 'messages'],
    ['/family', 'family'],
    ['/me', 'me'],
    ['/contact-book', 'family'],
    ['/calendar', 'family'],
    ['/leaves', 'family'],
    ['/medications', 'family'],
    ['/activity', 'family'],
    ['/events', 'family'],
    ['/announcements', 'family'],
    ['/attendance', 'family'],
    ['/fees', 'me'],
    ['/notifications/preferences', 'me'],
    ['/bind-additional', 'me'],
  ])('深層頁 %s 對應 tab %s', async (path, expectedTab) => {
    const router = await buildRouter()
    await router.push(path)
    expect(router.currentRoute.value.meta.tab).toBe(expectedTab)
  })
})
