import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import router from '@/router'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

const path = '/platform/observability'

afterEach(() => setUserInfo(null))

async function navigateToMetrics() {
  const route = router.getRoutes().find((candidate) => candidate.path === path)
  expect(route, '正式 router 必須註冊平台監控頁').toBeDefined()
  const testRouter = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path,
        // 不載入頁面與 API；使用正式 route 的守衛驗證深連結。
        component: { template: '<div />' },
        beforeEnter: route?.beforeEnter,
      },
      { path: '/error', component: { template: '<div />' } },
    ],
  })
  await testRouter.push(path)
  return testRouter.currentRoute.value
}

describe('正式平台監控入口', () => {
  it('只有平台維運碼即可通過 manifest 與正式 route，毋須開放一般設定', async () => {
    setUserInfo({ role: 'hq_admin', flags: ['platform_admin'], permission_names: ['PLATFORM_TENANTS_MANAGE'] })
    expect(canAccessRoute(path)).toBe(true)
    expect(canAccessRoute('/settings')).toBe(false)
    expect(router.resolve(path).meta.title).toBe('排程監控')
    expect((await navigateToMetrics()).path).toBe(path)
  })

  it('只有分校設定與稽核權限不能通過平台 route permission', () => {
    setUserInfo({ role: 'admin', flags: [], permission_names: ['SETTINGS_READ', 'AUDIT_LOGS'] })
    expect(canAccessRoute(path)).toBe(false)
  })

  it.each([['*'], ['PLATFORM_TENANTS_MANAGE']])('非平台帳號即使持有 %s 也不能用深連結進入', async (permission) => {
    setUserInfo({ role: 'admin', flags: [], permission_names: [permission] })
    const destination = await navigateToMetrics()
    expect(destination.path).toBe('/error')
    expect(destination.query.type).toBe('forbidden')
  })
})
