/**
 * 後台 IA 重整批次 1（2026-10-29）的舊網址保留：搬走／併入的頁面，舊 path 改 redirect，
 * 帶上 query 與頁籤參數；redirect 路由不掛 meta.title（避免全域搜尋出現同名兩筆）；
 * 舊路徑的權限規則仍由 manifest 保留（redirect 解析前不被彈走）。
 * 照 scheduleRedirect.spec.ts 用 follow() 取 matched[-1].redirect 二次 resolve。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

// M2 的 /reports beforeEnter 依 hasPermission('VENDOR_PAYMENT_READ') 分流；其餘 auth 匯出保持真實
const granted = vi.hoisted(() => new Set<string>())
vi.mock('@/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/auth')>()),
  hasPermission: (code: string) => granted.has(code),
}))

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

type EnterGuard = (to: RouteLocationNormalized) => unknown

describe('M2 固定支出登錄只留收付款管理', () => {
  const reportsGuard = () => {
    const rec = router.getRoutes().find((r) => r.path === '/reports')
    const guard = rec?.beforeEnter
    expect(guard).toBeTypeOf('function')
    return guard as unknown as EnterGuard
  }
  const to = (query: Record<string, string>) => ({ query }) as unknown as RouteLocationNormalized

  beforeEach(() => granted.clear())

  it('/reports?tab=fixed-cost 導到 /finance-signoffs?tab=fixed-cost，year／month 一併帶過去', () => {
    granted.add('VENDOR_PAYMENT_READ')
    expect(reportsGuard()(to({ tab: 'fixed-cost', year: '2025', month: '8' }))).toEqual({
      path: '/finance-signoffs',
      query: { tab: 'fixed-cost', year: '2025', month: '8' },
      replace: true,
    })
  })

  it('沒有 VENDOR_PAYMENT_READ：不導走（收付款管理看不到該頁籤），報表頁自行 fallback 總覽', () => {
    expect(reportsGuard()(to({ tab: 'fixed-cost' }))).toBe(true)
  })

  it('其他報表頁籤不受影響', () => {
    granted.add('VENDOR_PAYMENT_READ')
    expect(reportsGuard()(to({ tab: 'finance', year: '2025' }))).toBe(true)
    expect(reportsGuard()(to({}))).toBe(true)
  })
})

describe('M4 才藝異動變成報名管理頁籤', () => {
  it('/activity/changes 導到 /activity/registrations?tab=changes，query 一併帶過去', () => {
    expect(follow('/activity/changes').path).toBe('/activity/registrations')
    expect(follow('/activity/changes').query).toEqual({ tab: 'changes' })
    expect(follow('/activity/changes?foo=1').query).toEqual({ foo: '1', tab: 'changes' })
  })

  it('舊路由不掛 meta.title；/activity/registrations 仍是報名管理', () => {
    const old = router.getRoutes().find((r) => r.path === '/activity/changes')
    expect(old?.meta?.title).toBeUndefined()
    const hub = router.getRoutes().find((r) => r.path === '/activity/registrations')
    expect(hub?.meta?.title).toBe('報名管理')
  })

  it('側欄不再有「報名修改紀錄」，報名管理仍在', () => {
    const paths = SIDEBAR_TREE.groups.flatMap((g) => g.items.map((i) => i.index))
    expect(paths).not.toContain('/activity/changes')
    expect(paths).toContain('/activity/registrations')
  })

  it('舊路徑權限規則保留（仍為 ACTIVITY_READ）', () => {
    const rules = ROUTE_PERMISSION_RULES.filter((r) => r.path === '/activity/changes')
    expect(rules.map((r) => r.permission)).toEqual(['ACTIVITY_READ'])
  })
})

describe('M5 POS 稽核軌跡變成 POS 簽核頁籤', () => {
  it('/activity/audit/pos-unlock 導到 /activity/pos/approval?tab=audit，query 一併帶過去', () => {
    const r = follow('/activity/audit/pos-unlock')
    expect(r.path).toBe('/activity/pos/approval')
    expect(r.query).toEqual({ tab: 'audit' })
    expect(follow('/activity/audit/pos-unlock?foo=1').query).toEqual({ foo: '1', tab: 'audit' })
  })

  it('舊路由不掛 meta.title；/activity/pos/approval 仍是 POS 收款簽核', () => {
    const old = router.getRoutes().find((r) => r.path === '/activity/audit/pos-unlock')
    expect(old?.meta?.title).toBeUndefined()
    const page = router.getRoutes().find((r) => r.path === '/activity/pos/approval')
    expect(page?.meta?.title).toBe('POS 收款簽核')
  })

  it('舊路徑權限規則保留（仍為 ACTIVITY_PAYMENT_APPROVE）', () => {
    const rules = ROUTE_PERMISSION_RULES.filter((r) => r.path === '/activity/audit/pos-unlock')
    expect(rules.map((r) => r.permission)).toEqual(['ACTIVITY_PAYMENT_APPROVE'])
  })
})
