import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'

async function buildRouter() {
  const mod = await import('@/parent/router.js')
  const routes = mod.default.options.routes
  return createRouter({ history: createMemoryHistory(), routes })
}

// IA v3（2026-05-22）：/family 已砍，併入 /contact-book 歷史時序與 admin tab。
// 本檔保留為 regression guard：確保未來不會誤把 /family 加回來。
describe('parent router /family（IA v3 已移除）', () => {
  it('/family 路由不存在於 routes 列表', async () => {
    const router = await buildRouter()
    const found = router.options.routes.find((r) => r.path === '/family')
    expect(found).toBeUndefined()
  })

  it('/family push 走 catch-all redirect 至 /home', async () => {
    const router = await buildRouter()
    await router.push('/family')
    expect(router.currentRoute.value.path).toBe('/home')
  })
})
