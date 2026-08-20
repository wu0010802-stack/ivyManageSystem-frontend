/**
 * 稽核與資料品質整合（/governance）後的舊路徑相容。
 *
 * 三個舊入口在系統各處（書籤、全域搜尋、稽核信件連結）都可能被引用，一律 redirect
 * 到新分頁；操作紀錄有 URL 篩選同步（AuditLogView.url-sync），query 必須原樣帶過去。
 *
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
    typeof last.redirect === 'function'
      ? (last.redirect as (r: typeof res) => RouteLocationRaw)(res)
      : last.redirect
  return router.resolve(target)
}

describe('舊路徑 → /governance redirect', () => {
  it('/audit-logs → /governance/audit-logs', () => {
    expect(follow('/audit-logs').path).toBe('/governance/audit-logs')
  })

  it('/audit-logs 的篩選 query 原樣保留（URL 深連結）', () => {
    const r = follow('/audit-logs?entity_type=salary&username=admin')
    expect(r.path).toBe('/governance/audit-logs')
    expect(r.query.entity_type).toBe('salary')
    expect(r.query.username).toBe('admin')
  })

  it('/data-quality → /governance/data-quality', () => {
    expect(follow('/data-quality').path).toBe('/governance/data-quality')
  })

  it('/workbench/high-risk → /governance/high-risk', () => {
    expect(follow('/workbench/high-risk').path).toBe('/governance/high-risk')
  })
})

describe('/governance 落點依權限決定（子分頁互不外溢）', () => {
  const resolveRedirect = (path: string) => {
    const res = router.resolve(path)
    const last = res.matched[res.matched.length - 1]
    const target = typeof last?.redirect === 'function'
      ? (last.redirect as (r: typeof res) => RouteLocationRaw)(res)
      : last?.redirect
    return router.resolve(target as RouteLocationRaw).path
  }

  it('/governance 本身不是實頁，會 redirect 到某個子分頁', () => {
    expect(resolveRedirect('/governance').startsWith('/governance/')).toBe(true)
  })
})

describe('審核工作台簡化為單頁待簽核', () => {
  it('/workbench 本身即待簽核實頁（不再是分頁殼、不再依權限分岔落點）', () => {
    const res = router.resolve('/workbench')
    const last = res.matched[res.matched.length - 1]
    expect(last?.redirect).toBeUndefined()
    expect(last?.components?.default).toBeDefined()
  })

  it('/workbench/approvals 舊路徑仍可用', () => {
    expect(follow('/workbench/approvals').path).toBe('/workbench')
  })

  it('/approvals 舊路徑仍可用', () => {
    expect(follow('/approvals').path).toBe('/workbench')
  })
})
