/**
 * vue-router 4 的 `router.resolve()` 不追蹤 redirect，照 legacyRedirects.spec.ts
 * 用 follow() 取 matched[-1].redirect 二次 resolve。
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

describe('招生舊路由 → /students/admissions redirect', () => {
  it('/recruitment → /students/admissions', () => {
    expect(follow('/recruitment').path).toBe('/students/admissions')
  })

  it('/recruitment 帶 keyword query 保留（全域搜尋深連結）', () => {
    const r = follow('/recruitment?keyword=王小明')
    expect(r.path).toBe('/students/admissions')
    expect(r.query.keyword).toBe('王小明')
  })

  it('/recruitment-ivykids → /students/admissions?tab=ivykids', () => {
    const r = follow('/recruitment-ivykids')
    expect(r.path).toBe('/students/admissions')
    expect(r.query.tab).toBe('ivykids')
  })
})
