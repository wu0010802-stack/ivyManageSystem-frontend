/**
 * 年終 grid/config 為純 admin 路由（非 portal）。
 *
 * router guard（src/router/index.ts）對 `to.meta.requiresAuth && !loggedIn` 一律
 * 導向 `/portal/login`（教師 Portal 登入頁）——該旗標是為 portal 父路由設計的。
 * 若把它掛在 admin 路由上，session 過期／深連結未登入時管理員會被導到「教師 Portal
 * 登入頁」而非 `/login`（一般 admin 路由走 `next('/login')`）。
 *
 * 另外 admin 路由上的 `meta.permission` 完全不被 guard 消費：guard 只在對 portal 子路由
 * 讀 `to.meta.permission`（hasPortalPermission）；admin 端授權靠 canAccessRoute →
 * ROUTE_PERMISSION_RULES 的 `/year_end` prefix 規則把關，故 admin 路由的 meta.permission
 * 是誤導性死碼。
 */
import { describe, it, expect } from 'vitest'
import router from '@/router'

describe('年終 admin 路由 guard meta 一致性', () => {
  it.each([
    ['/year_end/cycles/7/grid'],
    ['/year_end/cycles/7/config'],
  ])('%s 為純 admin 路由（非 portal）', (path) => {
    const r = router.resolve(path)
    const last = r.matched[r.matched.length - 1]
    expect(last?.meta.portal).toBeFalsy()
  })

  it.each([
    ['/year_end/cycles/7/grid'],
    ['/year_end/cycles/7/config'],
  ])('%s 不得掛 portal-only 的 requiresAuth（否則未登入誤導向 /portal/login）', (path) => {
    const r = router.resolve(path)
    const last = r.matched[r.matched.length - 1]
    expect(last?.meta.requiresAuth).toBeFalsy()
  })

  it.each([
    ['/year_end/cycles/7/grid'],
    ['/year_end/cycles/7/config'],
  ])('%s 不得掛不被 guard 消費的死碼 permission', (path) => {
    const r = router.resolve(path)
    const last = r.matched[r.matched.length - 1]
    expect(last?.meta.permission).toBeUndefined()
  })

  it('全域不變式：任何非 portal 路由都不得掛 requiresAuth', () => {
    const offenders = router
      .getRoutes()
      .filter((rec) => rec.meta?.requiresAuth && !rec.meta?.portal)
      .map((rec) => rec.path)
    expect(offenders).toEqual([])
  })
})
