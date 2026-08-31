/**
 * 錯誤頁路由契約。
 *
 * 三條路由共用 ErrorStateView：
 * - `/portal/error`：portal 權限守衛的 403 落點（掛 PortalLayout 下，保留導覽）
 * - `/error`：admin 權限守衛的 403 落點（AdminLayout 下）
 * - `/:pathMatch(.*)*`：404 catch-all（bare 獨立頁；此前不存在，
 *   打錯網址會被守衛靜默導回 /portal/home 或第一個允許路由）
 *
 * meta.errorPage 是守衛的放行旗標：canAccessRoute 為 default-deny，
 * 錯誤頁不在 ROUTE_PERMISSION_RULES 內，少了此旗標 admin 會被再度重導、
 * 形成看不到錯誤頁的迴圈。
 */
import { describe, it, expect } from 'vitest'
import router from '@/router'

describe('portal 403 錯誤頁路由（/portal/error）', () => {
  it('掛在 portal 父路由下（meta.portal 由父路由帶入）', () => {
    const r = router.resolve('/portal/error')
    expect(r.matched.length).toBeGreaterThan(1)
    expect(r.meta.portal).toBe(true)
  })

  it('name 與 errorPage 旗標就位，且不得掛 meta.permission（否則權限不足者連錯誤頁都進不去）', () => {
    const r = router.resolve('/portal/error')
    const last = r.matched[r.matched.length - 1]
    expect(last?.name).toBe('portal-error')
    expect(r.meta.errorPage).toBe(true)
    expect(r.meta.permission).toBeUndefined()
  })
})

describe('admin 403 錯誤頁路由（/error）', () => {
  it('存在且帶 errorPage 旗標；非 portal、非 noAuth（未登入仍先導登入頁）', () => {
    const r = router.resolve('/error')
    const last = r.matched[r.matched.length - 1]
    expect(last?.name).toBe('admin-error')
    expect(r.meta.errorPage).toBe(true)
    expect(r.meta.portal).toBeUndefined()
    expect(r.meta.noAuth).toBeUndefined()
  })
})

describe('404 catch-all（/:pathMatch(.*)*）', () => {
  it('未知路徑落到 not-found，noAuth + bare（獨立頁、不套 AdminLayout）', () => {
    const r = router.resolve('/definitely/not/a/route')
    const last = r.matched[r.matched.length - 1]
    expect(last?.name).toBe('not-found')
    expect(r.meta.noAuth).toBe(true)
    expect(r.meta.bare).toBe(true)
    expect(r.meta.errorPage).toBe(true)
  })

  it('不遮蔽既有路由', () => {
    expect(router.resolve('/portal/albums').name).toBe('portal-albums')
    expect(router.resolve('/').name).toBe('home')
    expect(router.resolve('/maintenance').name).toBe('maintenance')
  })
})
