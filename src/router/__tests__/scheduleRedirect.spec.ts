/**
 * 舊「排班管理」入口 /schedule → /attendance（SPEC-027 §9.3）。
 *
 * 書籤與外部連結保留 date，並固定落在班表核對（tab=grid）；date 不合法時丟掉 date。
 * 照 governanceRedirects.spec.ts 用 follow() 取 matched[-1].redirect 二次 resolve。
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

describe('/schedule → /attendance redirect（SPEC-027 §9.3）', () => {
  it('/schedule?date=2026-09-14 落在 /attendance，保留 date 並帶 tab=grid', () => {
    const r = follow('/schedule?date=2026-09-14')
    expect(r.path).toBe('/attendance')
    expect(r.query).toEqual({ date: '2026-09-14', tab: 'grid' })
  })

  it('/schedule?date=not-a-date 落在 /attendance，丟掉不合法的 date', () => {
    const r = follow('/schedule?date=not-a-date')
    expect(r.path).toBe('/attendance')
    expect(r.query).toEqual({ tab: 'grid' })
  })

  it('/schedule 落在 /attendance，只帶 tab=grid', () => {
    const r = follow('/schedule')
    expect(r.path).toBe('/attendance')
    expect(r.query).toEqual({ tab: 'grid' })
  })
})
