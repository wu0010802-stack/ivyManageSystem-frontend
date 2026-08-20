/**
 * 路由覆蓋雙向 parity（流程詳設 §2.1 M3 / 前端詳設 §5 第 2 點）。
 *
 * 方向 1（router → manifest）：router 中每條「管理端實頁」路由（非 /portal、非
 * public/noAuth、非純 redirect；參數段代入樣本值）都必須被 manifest 衍生的
 * ROUTE_PERMISSION_RULES 涵蓋（最長匹配後 permission 集合非空），或列於
 * ROUTE_COVERAGE_EXEMPT 顯式豁免表（附理由）。→ 抓「加了路由忘了 manifest」：
 * canAccessRoute 是 default-deny，漏規則的頁面全員被擋、症狀出現得太晚。
 *
 * 方向 2（manifest → router）：manifest 中每個非 picker-only 頁（routePath 非
 * null）的主路由都必須真的存在於 router（且不是純 redirect）。→ 抓「manifest
 * 節點無對應 route」：側欄／規則指向不存在的頁面。
 *
 * 純 redirect 路由不在方向 1 範圍：redirect 目標本身會再走一次 guard；其中需要
 * 「redirect 解析前不被彈走」的舊路徑已以 manifest extraRoutes 保留規則
 * （如 /recruitment、/student-enrollment、/meetings），由 manifestIntegrity 的
 * fixture set-equality 守住。
 */
import { describe, expect, it } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'

import { routes } from '@/router/index'
import {
  PUBLIC_ROUTES,
  PUBLIC_ROUTE_PREFIXES,
  ROUTE_PERMISSION_RULES,
} from '@/constants/permissions'
import { NAVIGATION_MANIFEST } from '@/constants/navigation'
import type { ManifestPage } from '@/constants/navigation'

// ── 顯式豁免表（方向 1）──
// 每筆必附 reason。2026-07-31 遷移當下逐條核對 router 全部管理端實頁路由後為空：
// 所有實頁（含巢狀 children 與參數路由代樣本值後）皆被衍生規則的 exact/prefix
// 涵蓋。新增豁免前先確認該頁真的不該有權限規則（幾乎不存在這種頁——已登入即可
// 訪問的頁應收進 PUBLIC_ROUTES，如 /profile）。
const ROUTE_COVERAGE_EXEMPT: readonly { path: string; reason: string }[] = []

/**
 * 與 `src/utils/auth.ts` 的 `getRoutePermissions` 同邏輯（最長匹配那組的
 * permission 集合）。刻意重寫而非 import：測試不依賴被測物的私有實作。
 */
function routePermissions(path: string): string[] {
  const matched = ROUTE_PERMISSION_RULES.filter((rule) =>
    rule.prefix ? path === rule.path || path.startsWith(`${rule.path}/`) : path === rule.path
  )
  if (matched.length === 0) return []
  const maxLen = Math.max(...matched.map((r) => r.path.length))
  return matched.filter((r) => r.path.length === maxLen).map((r) => r.permission)
}

// ── router 攤平 ──

interface FlatRoute {
  path: string
  /** redirect 且無 component 且無 children = 純 redirect（不需自身權限規則）。 */
  pureRedirect: boolean
  noAuth: boolean
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
    out.push({
      path: full,
      pureRedirect:
        record.redirect !== undefined &&
        record.component === undefined &&
        !(record.children && record.children.length > 0),
      noAuth: Boolean(record.meta?.noAuth),
    })
    if (record.children) out.push(...flattenRoutes(record.children, full))
  }
  return out
}

/** 參數段代樣本值：`:id(\d+)` / `:id` / `:id?` → `1`（衍生規則只認靜態 path/prefix）。 */
function substituteParams(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+(\([^)]*\))?\??/g, '1')
}

const isPublicPath = (path: string): boolean =>
  PUBLIC_ROUTES.includes(path) || PUBLIC_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))

const FLAT = flattenRoutes(routes)

/** 方向 1 的受檢集合：管理端實頁（去 portal / public / noAuth / 純 redirect），參數代樣本值後去重。 */
const ADMIN_PAGE_PATHS = [
  ...new Set(
    FLAT.filter((r) => !r.path.startsWith('/portal'))
      .filter((r) => !r.noAuth)
      .filter((r) => !isPublicPath(r.path))
      .filter((r) => !r.pureRedirect)
      .map((r) => substituteParams(r.path))
  ),
]

/** 方向 2 的比對集合：router 中所有「實頁」路徑（不含純 redirect；原樣，manifest routePath 無參數段）。 */
const REAL_ROUTE_PATHS = new Set(FLAT.filter((r) => !r.pureRedirect).map((r) => r.path))

const ROUTED_MANIFEST_PAGES: ManifestPage[] = [
  ...NAVIGATION_MANIFEST.topLevel,
  ...NAVIGATION_MANIFEST.groups.flatMap((g) => [...g.pages]),
].filter((p) => p.routePath !== null)

describe('router ↔ manifest 路由覆蓋雙向 parity', () => {
  it('攤平抽得到足夠的管理端路由（防 flatten / 過濾條件失效假綠）', () => {
    expect(ADMIN_PAGE_PATHS.length).toBeGreaterThan(40)
    // 釘住代表性路徑：頂層頁、巢狀 child、深巢 child、參數路由（樣本值代換）
    expect(ADMIN_PAGE_PATHS).toContain('/dismissal-queue')
    expect(ADMIN_PAGE_PATHS).toContain('/admin/gov-reports/monthly')
    expect(ADMIN_PAGE_PATHS).toContain('/governance/high-risk')
    expect(ADMIN_PAGE_PATHS).toContain('/appraisal-year-end/rules/scoring')
    expect(ADMIN_PAGE_PATHS).toContain('/employees/1')
    // 排除面也釘住：public / portal / 純 redirect 不得混入
    expect(ADMIN_PAGE_PATHS).not.toContain('/login')
    expect(ADMIN_PAGE_PATHS).not.toContain('/profile')
    expect(ADMIN_PAGE_PATHS).not.toContain('/recruitment')
    // 2026-08-20 整併後三條舊入口都成了純 redirect
    expect(ADMIN_PAGE_PATHS).not.toContain('/audit-logs')
    expect(ADMIN_PAGE_PATHS).not.toContain('/data-quality')
    expect(ADMIN_PAGE_PATHS).not.toContain('/workbench/high-risk')
    expect(ADMIN_PAGE_PATHS.some((p) => p.startsWith('/portal'))).toBe(false)
  })

  it('方向 1：每條管理端實頁路由都被衍生規則涵蓋（或列於豁免表）', () => {
    const exemptPaths = new Set(ROUTE_COVERAGE_EXEMPT.map((e) => e.path))
    const offenders = ADMIN_PAGE_PATHS.filter(
      (path) => !exemptPaths.has(path) && routePermissions(path).length === 0
    )
    expect(
      offenders,
      'router 有管理端實頁未被 manifest 衍生規則涵蓋（default-deny 會擋下所有人）。\n' +
        '修法：在 navigation/manifest.ts 對應頁面掛 views/sharedViews 或 extraRoutes；' +
        '確認該頁不該有規則者，列入本檔 ROUTE_COVERAGE_EXEMPT 並附 reason。\n' +
        offenders.map((p) => `  ${p}`).join('\n')
    ).toEqual([])
  })

  it('豁免表衛生：每筆附非空 reason、路徑真實存在、且確實未被規則涵蓋（防過時豁免）', () => {
    for (const { path, reason } of ROUTE_COVERAGE_EXEMPT) {
      expect(reason.trim().length, `${path} 豁免缺 reason`).toBeGreaterThan(0)
      expect(ADMIN_PAGE_PATHS, `${path} 豁免的路徑不存在於 router（過時豁免，請移除）`).toContain(path)
      expect(
        routePermissions(path),
        `${path} 已被衍生規則涵蓋，豁免多餘（請移除）`
      ).toEqual([])
    }
  })

  it('方向 2：manifest 每個非 picker-only 頁的 routePath 都存在於 router（且非純 redirect）', () => {
    expect(ROUTED_MANIFEST_PAGES.length).toBeGreaterThan(30) // 防 manifest 攤平失效假綠
    const offenders = ROUTED_MANIFEST_PAGES.filter((p) => !REAL_ROUTE_PATHS.has(p.routePath as string))
    expect(
      offenders.map((p) => `${p.key} → ${p.routePath}`),
      'manifest 頁面指向 router 不存在（或僅為純 redirect）的路由。\n' +
        '修法：補 src/router/index.ts 路由，或該節點改 routePath: null（picker-only）／自 manifest 移除。'
    ).toEqual([])
  })
})
