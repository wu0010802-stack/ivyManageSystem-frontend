/**
 * 年終 cycle 工作區路由 guard meta 一致性（純 admin 路由，非 portal）。
 *
 * 2026-07-21 單一工作區 shell 改版：`year-end/cycles/:id` 原本的三個獨立路由
 * （detail/grid/config）合併成單一 `YearEndWorkspaceView`（route name
 * `year-end-cycle-workspace`），改用 `?step=config|grid|detail` 切換內容。
 * 原 `.../grid`、`.../config` 兩子路由改為純 redirect（帶 `?step=` 導回工作區），
 * 不再是渲染型路由記錄、不再掛自己的 meta。
 *
 * router guard（src/router/index.ts）對 `to.meta.requiresAuth && !loggedIn` 一律
 * 導向 `/portal/login`（教師 Portal 登入頁）——該旗標是為 portal 父路由設計的。
 * 若把它掛在 admin 路由上，session 過期／深連結未登入時管理員會被導到「教師 Portal
 * 登入頁」而非 `/login`（一般 admin 路由走 `next('/login')`）。
 *
 * 另外 admin 路由上的 `meta.permission` 完全不被 guard 消費：guard 只在對 portal 子路由
 * 讀 `to.meta.permission`（hasPortalPermission）；admin 端授權靠 canAccessRoute →
 * ROUTE_PERMISSION_RULES 的 `/appraisal-year-end` prefix 規則把關，故 admin 路由的
 * meta.permission 是誤導性死碼。
 */
import { describe, it, expect } from 'vitest'
import router from '@/router'

const WORKSPACE_PATH = '/appraisal-year-end/year-end/cycles/7'

describe('年終 admin 路由 guard meta 一致性（工作區路由）', () => {
  it(`${WORKSPACE_PATH} 為純 admin 路由（非 portal），meta.title 保留`, () => {
    const r = router.resolve(WORKSPACE_PATH)
    const last = r.matched[r.matched.length - 1]
    expect(last?.meta.portal).toBeFalsy()
    expect(last?.meta.title).toBeTruthy()
  })

  it(`${WORKSPACE_PATH} 不得掛 portal-only 的 requiresAuth（否則未登入誤導向 /portal/login）`, () => {
    const r = router.resolve(WORKSPACE_PATH)
    const last = r.matched[r.matched.length - 1]
    expect(last?.meta.requiresAuth).toBeFalsy()
  })

  it(`${WORKSPACE_PATH} 不得掛不被 guard 消費的死碼 permission`, () => {
    const r = router.resolve(WORKSPACE_PATH)
    const last = r.matched[r.matched.length - 1]
    expect(last?.meta.permission).toBeUndefined()
  })

  it(`${WORKSPACE_PATH} route name 為 year-end-cycle-workspace（三路由合併後單一入口）`, () => {
    const r = router.resolve(WORKSPACE_PATH)
    const last = r.matched[r.matched.length - 1]
    expect(last?.name).toBe('year-end-cycle-workspace')
  })

  it('全域不變式：任何非 portal 路由都不得掛 requiresAuth', () => {
    const offenders = router
      .getRoutes()
      .filter((rec) => rec.meta?.requiresAuth && !rec.meta?.portal)
      .map((rec) => rec.path)
    expect(offenders).toEqual([])
  })
})

describe('年終 grid/config 子路由改 redirect 帶 step（工作區 shell 合併）', () => {
  it.each([
    ['/appraisal-year-end/year-end/cycles/7/grid', 'grid'],
    ['/appraisal-year-end/year-end/cycles/7/config', 'config'],
  ])('%s → 工作區 ?step=%s', (path, step) => {
    const r = router.resolve(path)
    const record = r.matched[r.matched.length - 1]
    expect(record).toBeTruthy()
    expect(typeof record.redirect).toBe('function')
    const redirectFn = record.redirect as (to: {
      params: Record<string, string>
    }) => { path: string; query: Record<string, string> }
    expect(redirectFn({ params: { id: '7' } })).toEqual({
      path: WORKSPACE_PATH,
      query: { step },
    })
  })
})

describe('年終 admin 路由舊路徑 redirect（書籤 / 深連結相容）', () => {
  // router.resolve() 不會遞迴解析 redirect（只回傳被請求路徑自身匹配到的 record），
  // 故直接呼叫該 record 的 redirect 函式驗證輸出落點。
  it.each([
    ['/year_end/cycles/7', '/appraisal-year-end/year-end/cycles/7'],
    ['/year_end/cycles/7/grid', '/appraisal-year-end/year-end/cycles/7/grid'],
    ['/year_end/cycles/7/config', '/appraisal-year-end/year-end/cycles/7/config'],
  ])('%s → %s', (from, to) => {
    const r = router.resolve(from)
    const record = r.matched[r.matched.length - 1]
    expect(record).toBeTruthy()
    expect(typeof record.redirect).toBe('function')
    const redirectFn = record.redirect as (to: { params: Record<string, string> }) => string
    expect(redirectFn({ params: { id: '7' } })).toBe(to)
  })
})
