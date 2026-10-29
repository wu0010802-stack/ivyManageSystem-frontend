/**
 * 後台 IA 重整批次 1（2026-10-29）的舊網址保留：搬走／併入的頁面，舊 path 改 redirect，
 * 帶上 query 與頁籤參數；redirect 路由不掛 meta.title（避免全域搜尋出現同名兩筆）；
 * 舊路徑的權限規則仍由 manifest 保留（redirect 解析前不被彈走）。
 * 照 scheduleRedirect.spec.ts 用 follow() 取 matched[-1].redirect 二次 resolve。
 */
import { describe, it, expect } from 'vitest'
import type { RouteLocationRaw } from 'vue-router'
import router from '@/router'
import { SIDEBAR_TREE } from '@/constants/navigation'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

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

const sidebarPaths = () =>
  SIDEBAR_TREE.groups.flatMap((g) => g.items.map((i) => i.index))

describe('M1 公告分類併入公告管理', () => {
  it('/announcement-categories 導到 /announcements?tab=categories', () => {
    const r = follow('/announcement-categories')
    expect(r.path).toBe('/announcements')
    expect(r.query).toEqual({ tab: 'categories' })
  })

  it('舊網址的其他 query 一併帶過去', () => {
    const r = follow('/announcement-categories?foo=1')
    expect(r.path).toBe('/announcements')
    expect(r.query).toEqual({ foo: '1', tab: 'categories' })
  })

  it('舊路由不掛 meta.title；/announcements 仍是公告管理', () => {
    const old = router.getRoutes().find((r) => r.path === '/announcement-categories')
    expect(old?.meta?.title).toBeUndefined()
    const hub = router.getRoutes().find((r) => r.path === '/announcements')
    expect(hub?.meta?.title).toBe('公告管理')
  })

  it('側欄不再有「公告分類管理」項，公告管理仍在', () => {
    const paths = sidebarPaths()
    expect(paths).not.toContain('/announcement-categories')
    expect(paths).toContain('/announcements')
  })

  it('舊路徑權限規則保留（仍為 ANNOUNCEMENTS_READ）', () => {
    const rules = ROUTE_PERMISSION_RULES.filter((r) => r.path === '/announcement-categories')
    expect(rules.map((r) => r.permission)).toEqual(['ANNOUNCEMENTS_READ'])
  })
})
