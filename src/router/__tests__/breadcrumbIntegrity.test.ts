/**
 * 麵包屑父層全路由完整性守衛（spec §7 測試 5）。
 *
 * 守的是：任何管理端路由解析出的父層，都必須是「存在、非容器、非自己、有文字」
 * 的可導航目標。任何一條紅了代表 §3.1 規則對它有洞——**修法是補該路由的
 * meta.parent，不是放寬本檔斷言**。
 */
import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'

import { routes } from '@/router/index'
import { BREADCRUMB_PARENTS } from '@/constants/navigation'
import { resolveBreadcrumbParent } from '@/utils/breadcrumb'

interface FlatRoute {
  path: string
  hasComponent: boolean
  isRedirect: boolean
  title: string
  parent?: string
}

function joinPath(base: string, segment: string): string {
  if (segment.startsWith('/')) return segment
  if (segment === '') return base
  return base === '/' || base === '' ? `/${segment}` : `${base}/${segment}`
}

function flattenRoutes(records: readonly RouteRecordRaw[], base = ''): FlatRoute[] {
  const out: FlatRoute[] = []
  for (const record of records) {
    const full = joinPath(base, record.path)
    const title = typeof record.meta?.title === 'string' ? record.meta.title : ''
    const parent = typeof record.meta?.parent === 'string' ? record.meta.parent : undefined
    out.push({
      path: full,
      hasComponent: record.component !== undefined,
      isRedirect: record.redirect !== undefined,
      title,
      ...(parent ? { parent } : {}),
    })
    if (record.children) out.push(...flattenRoutes(record.children, full))
  }
  return out
}

const ALL = flattenRoutes(routes)
const byPath = new Map(ALL.map((r) => [r.path, r]))

const isContainer = (p: string) => byPath.get(p)?.isRedirect === true
const titleOf = (p: string) => byPath.get(p)?.title ?? ''

/** 管理端實頁：有 component、非 portal/public/kiosk、非動態參數、非錯誤頁。 */
const ADMIN_PAGES = ALL.filter(
  (r) =>
    r.hasComponent &&
    !r.path.startsWith('/portal') &&
    !r.path.startsWith('/public') &&
    !r.path.startsWith('/kiosk') &&
    // catch-all（/:pathMatch(.*)* 的 404 落點）不是實頁，排除。
    // 但**保留含 :id 的詳情頁**——那批（員工詳情、學生檔案、分校詳情、調查詳情）
    // 正是本功能最該守的目標；解析走字串前綴匹配，帶參數與正則約束照樣正確命中。
    !r.path.startsWith('/:') &&
    !['/login', '/maintenance', '/error', '/change-password'].includes(r.path),
)

const resolveFor = (r: FlatRoute) =>
  resolveBreadcrumbParent(r.path, {
    parents: BREADCRUMB_PARENTS,
    isContainer,
    titleOf,
    ...(r.parent ? { metaParent: r.parent } : {}),
  })

describe('麵包屑父層完整性守衛', () => {
  it('防假綠哨兵：確實掃到足量管理端實頁', () => {
    expect(ADMIN_PAGES.length).toBeGreaterThan(40)
    const paths = ADMIN_PAGES.map((r) => r.path)
    expect(paths).toContain('/salary/growth-contract')
    expect(paths).toContain('/employees')
    expect(paths).not.toContain('/portal/home')
    // 詳情頁必須在掃描範圍內：它們是本功能的核心目標，被排除等於守衛沒守到重點。
    expect(
      paths.some((p) => p.startsWith('/employees/:')),
      '詳情頁（動態參數路由）被排除在守衛掃描之外',
    ).toBe(true)
  })

  it('每個解析出的父層都存在、非容器、非自己、有顯示文字', () => {
    const offenders: string[] = []
    for (const r of ADMIN_PAGES) {
      const parent = resolveFor(r)
      if (parent === null) continue
      if (!byPath.has(parent.path)) offenders.push(`${r.path} → 父層 ${parent.path} 不存在於 router`)
      if (isContainer(parent.path)) offenders.push(`${r.path} → 父層 ${parent.path} 是 redirect 容器`)
      if (parent.path === r.path) offenders.push(`${r.path} → 父層等於自己（點了沒反應）`)
      if (parent.title.trim().length === 0) offenders.push(`${r.path} → 父層顯示文字為空`)
    }
    expect(
      offenders,
      '父層解析出不可用目標。修法：補該路由的 meta.parent 指向實質頁面，不要放寬本斷言。',
    ).toEqual([])
  })

  it('反查確實生效：至少 15 條管理端頁面取得父層', () => {
    const withParent = ADMIN_PAGES.filter((r) => resolveFor(r) !== null)
    expect(withParent.length).toBeGreaterThanOrEqual(15)
  })

  it('代表性路徑的父層符合設計（spec §3.3 邊界表）', () => {
    // 取不到就 throw，讓「路由被改名」這種前提失效大聲失敗，
    // 而不是靜默變成 undefined 後假綠。
    const pageAt = (p: string): FlatRoute => {
      const r = byPath.get(p)
      if (!r) throw new Error(`測試前提失效：router 中找不到 ${p}`)
      return r
    }
    // 詳情頁的 path 帶正則約束（/employees/:id(\d+)），用前綴找而非寫死字面，
    // 免得日後有人調整約束就讓測試脆裂。
    const parentTitleOfPageStartingWith = (prefix: string): string | undefined => {
      const r = ADMIN_PAGES.find((x) => x.path.startsWith(prefix))
      if (!r) throw new Error(`測試前提失效：找不到以 ${prefix} 開頭的管理端頁面`)
      return resolveFor(r)?.title
    }

    expect(resolveFor(pageAt('/salary/growth-contract'))?.title).toBe('薪資管理')
    expect(resolveFor(pageAt('/salary/history'))?.title).toBe('薪資管理')
    expect(resolveFor(pageAt('/surveys/new'))?.title).toBe('調查管理')
    expect(resolveFor(pageAt('/employees'))).toBeNull()
    expect(resolveFor(pageAt('/activity/dashboard'))).toBeNull()

    // 詳情頁——本功能的核心目標
    expect(parentTitleOfPageStartingWith('/employees/:')).toBe('員工管理')
    expect(parentTitleOfPageStartingWith('/students/profile/')).toBe('學生')
    expect(parentTitleOfPageStartingWith('/platform/tenants/:')).toBe('分校管理')
    expect(parentTitleOfPageStartingWith('/surveys/:')).toBe('調查管理')

    // 容器撤銷：這三個模組有自己的 segmented/tabs 橫向導覽，父層點下去會被
    // redirect 轉回原頁，故刻意無父層（spec §3.2）。
    // 2026-08-20：審核工作台收斂為單頁（/workbench 本身即實頁、不再是容器），
    // 分頁容器的代表案例改由稽核與資料品質三分頁承擔。
    expect(resolveFor(pageAt('/governance/audit-logs'))).toBeNull()
    expect(resolveFor(pageAt('/governance/high-risk'))).toBeNull()
    expect(resolveFor(pageAt('/bus/monitor'))).toBeNull()
    expect(resolveFor(pageAt('/appraisal-year-end/overview'))).toBeNull()
  })
})
