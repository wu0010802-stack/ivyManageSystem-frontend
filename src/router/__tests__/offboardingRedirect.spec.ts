/**
 * vue-router 4 的 router.resolve() 不追蹤 redirect；用 follow() 手動取
 * matched[-1].redirect 並二次 resolve（與 legacyRedirects.spec.ts 同手法）。
 */
import { describe, it, expect } from 'vitest'
import type { RouteLocationRaw } from 'vue-router'
import router from '@/router'

function follow(from: string) {
  const res = router.resolve(from)
  const last = res.matched[res.matched.length - 1]
  if (!last?.redirect) return res
  const target: RouteLocationRaw =
    typeof last.redirect === 'function'
      ? (last.redirect as (r: typeof res) => RouteLocationRaw)(res)
      : last.redirect
  return router.resolve(target)
}

describe('離職管理舊路由 → 員工管理整合頁 redirect', () => {
  it('/admin/offboarding → /employees?section=offboarding', () => {
    const r = follow('/admin/offboarding')
    expect(r.path).toBe('/employees')
    expect(r.query.section).toBe('offboarding')
  })

  it('保留 query merge：/admin/offboarding?foo=1 → 帶上 foo', () => {
    const r = follow('/admin/offboarding?foo=1')
    expect(r.path).toBe('/employees')
    expect(r.query.section).toBe('offboarding')
    expect(r.query.foo).toBe('1')
  })
})
