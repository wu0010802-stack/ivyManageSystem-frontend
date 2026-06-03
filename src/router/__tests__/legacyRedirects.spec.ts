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
  it.each([
    ['/appraisal-management', 'appraisal'],
    ['/year_end/cycles', 'year-end'],
    ['/year-end/appraisal-payout', 'payout'],
  ])('%s → /appraisal-year-end?section=%s', (from, section) => {
    const r = follow(from)
    expect(r.path).toBe('/appraisal-year-end')
    expect(r.query.section).toBe(section)
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

  it('下鑽路由維持獨立（不被 redirect）', () => {
    expect(follow('/year_end/cycles/7').path).toBe('/year_end/cycles/7')
    expect(follow('/appraisal/cycles/3').path).toBe('/appraisal/cycles/3')
  })
})
