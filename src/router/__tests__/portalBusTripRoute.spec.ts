/**
 * 隨車老師娃娃車頁的路由 meta 契約。
 *
 * portal 子路由的授權由 `router.beforeEach` 讀 `to.meta.permission` 再走
 * `hasPortalPermission` 判定（admin 端的 `ROUTE_PERMISSION_RULES` 不涵蓋 `/portal/*`）。
 * 因此 meta.permission 一旦漏掉或拼錯，這一頁就對**任何**登入教師開放——而它會下發
 * 全車學生姓名與家庭座標。
 */
import { describe, it, expect } from 'vitest'
import router from '@/router'
import { PERMISSION_NAMES } from '@/constants/permissions'

const PATH = '/portal/bus-trip'

describe('portal 娃娃車班次路由', () => {
  it('掛在 portal 父路由底下（meta.portal 由父路由帶入，guard 才會檢查權限）', () => {
    const r = router.resolve(PATH)
    expect(r.matched.length).toBeGreaterThan(1)
    expect(r.meta.portal).toBe(true)
  })

  it('meta.permission 為 BUS_TRIPS_OPERATE', () => {
    const r = router.resolve(PATH)
    expect(r.meta.permission).toBe('BUS_TRIPS_OPERATE')
  })

  it('permission 字面與前端常數表一致（常數表與後端 Permission enum 對齊）', () => {
    const r = router.resolve(PATH)
    expect(r.meta.permission).toBe(PERMISSION_NAMES.BUS_TRIPS_OPERATE)
    expect(PERMISSION_NAMES.BUS_TRIPS_OPERATE).toBe('BUS_TRIPS_OPERATE')
  })

  it('route name 與標題就位', () => {
    const r = router.resolve(PATH)
    const last = r.matched[r.matched.length - 1]
    expect(last?.name).toBe('portal-bus-trip')
    expect(last?.meta.title).toBe('娃娃車班次')
  })
})
