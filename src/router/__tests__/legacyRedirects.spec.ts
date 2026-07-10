/**
 * vue-router 4 的 `router.resolve()` 不追蹤 redirect（redirect 只在實際 navigation 時執行）。
 * 這裡改用 `follow()` helper 手動取 matched[-1].redirect 並二次 resolve，
 * 與 vue-router 內部 handleRedirectRecord 行為一致，同時不需起 navigation guards。
 */
import { describe, it, expect } from 'vitest'
import type { RouteLocationRaw } from 'vue-router'
import router from '@/router'

function follow(from: string) {
  const res = router.resolve(from)
  const last = res.matched[res.matched.length - 1]
  if (!last?.redirect) return res
  const target: RouteLocationRaw =
    typeof last.redirect === 'function' ? (last.redirect as (r: typeof res) => RouteLocationRaw)(res) : last.redirect
  return router.resolve(target)
}

describe('考核/年終 舊路由 → 整合工作區 redirect', () => {
  it('/appraisal-management → section=appraisal', () => {
    const r = follow('/appraisal-management')
    expect(r.path).toBe('/appraisal-year-end')
    expect(r.query.section).toBe('appraisal')
  })

  // 2026-07-10 巢狀路由改版：/year_end/cycles、/year-end/appraisal-payout 改為直接
  // redirect 到新巢狀路徑，不再繞經 /appraisal-year-end?section= 相容層（見 router/index.ts）。
  it('/year_end/cycles → /appraisal-year-end/year-end（巢狀路由，直達不繞 query 相容層）', () => {
    const r = follow('/year_end/cycles')
    expect(r.path).toBe('/appraisal-year-end/year-end')
  })

  it('/year-end/appraisal-payout → /appraisal-year-end/year-end/payout（巢狀路由，query 透傳）', () => {
    const r = follow('/year-end/appraisal-payout')
    expect(r.path).toBe('/appraisal-year-end/year-end/payout')
  })

  it('/appraisal/cycles → section=appraisal&tab=history', () => {
    const r = follow('/appraisal/cycles')
    expect(r.path).toBe('/appraisal-year-end')
    expect(r.query).toMatchObject({ section: 'appraisal', tab: 'history' })
  })

  it('/appraisal/settings → section=appraisal&tab=settings', () => {
    const r = follow('/appraisal/settings')
    expect(r.path).toBe('/appraisal-year-end')
    expect(r.query).toMatchObject({ section: 'appraisal', tab: 'settings' })
  })

  // 2026-07-10 巢狀路由改版：年終下鑽路由（cycle 明細/總表/本期設定）搬進
  // /appraisal-year-end/year-end/cycles/:id* 巢狀 children，names 保留；舊路徑
  // /year_end/cycles/:id* 反轉為 redirect（與改版前「維持獨立不被 redirect」相反）。
  it('年終下鑽路由已巢狀化：舊路徑 redirect 到新巢狀路徑', () => {
    expect(follow('/year_end/cycles/7').path).toBe('/appraisal-year-end/year-end/cycles/7')
  })

  it('/appraisal/cycles/:id → 內嵌明細（section=appraisal&tab=history&cycle=:id）', () => {
    const r = follow('/appraisal/cycles/3')
    expect(r.path).toBe('/appraisal-year-end')
    expect(r.query).toMatchObject({ section: 'appraisal', tab: 'history', cycle: '3' })
  })
})
