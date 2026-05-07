import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'

async function buildRouter() {
  const mod = await import('@/parent/router.js')
  // router 預設用 hash history，測試改用 memory history 重建一份
  const routes = mod.default.options.routes
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('parent router IA v2', () => {
  it('/me 路由存在且 meta.tab=more（Phase 1 過渡期）', async () => {
    const router = await buildRouter()
    await router.push('/me')
    expect(router.currentRoute.value.name).toBe('parent-me')
    expect(router.currentRoute.value.meta.tab).toBe('more')
  })

  it('/more 會 redirect 到 /me', async () => {
    const router = await buildRouter()
    await router.push('/more')
    expect(router.currentRoute.value.path).toBe('/me')
  })
})
