import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'

async function buildRouter() {
  const mod = await import('@/parent/router.js')
  const routes = mod.default.options.routes
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('parent router /family', () => {
  it('/family 路由存在且 meta.tab=family（Phase 2B 已加路由，Phase 3 才上 tab bar）', async () => {
    const router = await buildRouter()
    await router.push('/family')
    expect(router.currentRoute.value.name).toBe('parent-family')
    expect(router.currentRoute.value.meta.tab).toBe('family')
  })

  it('/family 不會被 catch-all 吃掉', async () => {
    const router = await buildRouter()
    await router.push('/family')
    expect(router.currentRoute.value.path).toBe('/family')
  })
})
