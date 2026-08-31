// manifest 衍生層：全部 pure function，於 ./index.ts module-level 執行一次
//（manifest 靜態，無需 computed）。與「使用者權限 / 路由 / 後端 definition」相依的
// 過濾（sidebar 可見性、activeMenu、picker join definition）留在元件端 computed。
import type { Component } from 'vue'
import type { ManifestPage, NavigationManifest } from './manifest'

export interface RoutePermissionRule {
  path: string
  permission: string
  prefix?: boolean
}

function allPages(m: NavigationManifest): ManifestPage[] {
  return [...m.topLevel, ...m.groups.flatMap((g) => [...g.pages])]
}

const matchRule = (rule: RoutePermissionRule, path: string): boolean =>
  rule.prefix ? path === rule.path || path.startsWith(`${rule.path}/`) : path === rule.path

/** 與 auth.ts getRoutePermissions 同語意：最長匹配那組的 permission 集合。 */
function permissionsAt(rules: readonly RoutePermissionRule[], path: string): Set<string> {
  const matched = rules.filter((r) => matchRule(r, path))
  if (matched.length === 0) return new Set()
  const maxLen = Math.max(...matched.map((r) => r.path.length))
  return new Set(matched.filter((r) => r.path.length === maxLen).map((r) => r.permission))
}

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((x) => b.has(x))

/**
 * 行為保持的冗餘消除：exact 規則組若整組移除後，該 path 的最長匹配 permission 集合
 * 不變（落到某條同權限的 prefix 規則上），則整組刪除。
 *
 * Why：選單頁的主路由會自動衍生 exact 規則（如 /admin/gov-reports/certificates ×
 * GOV_REPORTS_VIEW），但該路徑常已被同權限的 prefix 規則（/admin/gov-reports prefix）
 * 涵蓋——保留只是雜訊，且會讓輸出偏離既有手寫規則集合（fixture set-equality 紅）。
 *
 * 安全性論證（對齊 auth.ts 的 longest-match）：
 * - exact 規則只影響「查詢路徑 == 其 path」這一個查詢點；prefix 規則永不被移除。
 * - 整組移除後以實際匹配邏輯重算該點的 permission 集合，集合相等才移除
 *   （部分覆蓋如 /appraisal-year-end/rules/scoring（僅 APPRAISAL_READ）vs 其上層
 *   prefix（APPRAISAL_READ+SETTINGS_READ）集合不等 → 保留，維持「長路徑收窄」語意）。
 * - 各 path 的決策互相獨立（exact 規則不影響其他 path 的查詢），無迭代順序問題。
 */
function pruneRedundantExactRules(rules: RoutePermissionRule[]): RoutePermissionRule[] {
  const exactPaths = [...new Set(rules.filter((r) => !r.prefix).map((r) => r.path))]
  const dropPaths = new Set<string>()
  for (const path of exactPaths) {
    // 同 path 存在 prefix 規則時不處理：兩者在 longest-match 同長度並列，語意糾纏不值得分析。
    if (rules.some((r) => r.prefix && r.path === path)) continue
    const before = permissionsAt(rules, path)
    const remaining = rules.filter((r) => !(r.path === path && !r.prefix))
    const after = permissionsAt(remaining, path)
    if (sameSet(before, after)) dropPaths.add(path)
  }
  return rules.filter((r) => r.prefix || !dropPaths.has(r.path))
}

/**
 * 攤平：每頁主路由 ×（views ∪ sharedViews）每碼一條 + extraRoutes 原樣，
 * 去重（path+permission+prefix）後做行為保持的冗餘消除。
 * 輸出 shape 與舊手寫 ROUTE_PERMISSION_RULES 一致（prefix 只在 true 時出現）。
 */
export function deriveRoutePermissionRules(m: NavigationManifest): RoutePermissionRule[] {
  const raw: RoutePermissionRule[] = []
  for (const page of allPages(m)) {
    if (page.routePath !== null) {
      const codes = [...page.views.map((v) => v.code), ...(page.sharedViews ?? [])]
      for (const code of codes) {
        raw.push(
          page.routePrefix
            ? { path: page.routePath, permission: code, prefix: true }
            : { path: page.routePath, permission: code },
        )
      }
    }
    for (const rule of page.extraRoutes ?? []) {
      raw.push(
        rule.prefix
          ? { path: rule.path, permission: rule.permission, prefix: true }
          : { path: rule.path, permission: rule.permission },
      )
    }
  }
  const seen = new Set<string>()
  const deduped = raw.filter((r) => {
    const key = `${r.path}\u0000${r.permission}\u0000${r.prefix === true}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return pruneRedundantExactRules(deduped)
}

export interface SidebarItem {
  /** el-menu-item index = routePath。 */
  index: string
  title: string
  icon: Component
  badgeKey?: 'workbench' | 'governance' | 'activityInquiries' | 'activityReview'
  /** views ∪ sharedViews；可見性 = some(hasPermission)，由元件端 computed 過濾。 */
  visibleCodes: readonly string[]
}

export interface SidebarGroup {
  /** el-sub-menu index = `group-${key}`（沿用現值，unique-opened 展開行為不變）。 */
  index: string
  title: string
  icon: Component
  items: SidebarItem[]
}

function toSidebarItem(page: ManifestPage): SidebarItem | null {
  if (!page.menu || page.routePath === null) return null
  const item: SidebarItem = {
    index: page.routePath,
    title: page.title,
    icon: page.menu.icon,
    visibleCodes: [...page.views.map((v) => v.code), ...(page.sharedViews ?? [])],
  }
  if (page.menu.badgeKey) item.badgeKey = page.menu.badgeKey
  return item
}

/**
 * 只收有 menu 的頁與非 pickerOnly 群組。群組可見性 =「items 權限濾後非空」，
 * 由元件端決定（本函式不做權限過濾）。
 *
 * topLevel 依 menu.placement 拆兩束：預設束渲染在群組之前（既有行為），
 * `placement: 'bottom'` 束渲染在所有群組之後（側欄最底）。
 */
export function deriveSidebarTree(m: NavigationManifest): {
  topLevel: SidebarItem[]
  bottomLevel: SidebarItem[]
  groups: SidebarGroup[]
} {
  const flat = m.topLevel
    .map((page) => ({ page, item: toSidebarItem(page) }))
    .filter((x): x is { page: ManifestPage; item: SidebarItem } => x.item !== null)
  const topLevel = flat.filter((x) => x.page.menu?.placement !== 'bottom').map((x) => x.item)
  const bottomLevel = flat.filter((x) => x.page.menu?.placement === 'bottom').map((x) => x.item)
  const groups = m.groups
    .filter((g) => !g.pickerOnly)
    .map((g) => ({
      index: `group-${g.key}`,
      title: g.title,
      icon: g.icon,
      items: g.pages.map(toSidebarItem).filter((it): it is SidebarItem => it !== null),
    }))
  return { topLevel, bottomLevel, groups }
}

/** activeMenu 前綴表：全部 menu 頁的 routePath，供元件端最長前綴匹配高亮。 */
export function deriveActiveMenuPaths(m: NavigationManifest): string[] {
  return allPages(m)
    .filter((p) => p.menu && p.routePath !== null)
    .map((p) => p.routePath as string)
}

export interface BreadcrumbParent {
  /** 父層目標路徑（= 選單項 routePath）。 */
  path: string
  /** 顯示文字（= 選單項 title，與側邊欄字面同源）。 */
  title: string
}

/**
 * 麵包屑父層候選表：全部「有 menu 且有 routePath」的選單項。
 * 依 path 長度降冪排序 → 消費端 find 第一個命中即最長前綴，無需再比長度。
 */
export function deriveBreadcrumbParents(m: NavigationManifest): BreadcrumbParent[] {
  return allPages(m)
    .filter((p) => p.menu && p.routePath !== null)
    .map((p) => ({ path: p.routePath as string, title: p.title }))
    .sort((a, b) => b.path.length - a.path.length)
}

/** owned = 全部 views + actions + standalone codes；供完整性測試與孤兒偵測。 */
export function collectOwnedCodes(m: NavigationManifest): Set<string> {
  const owned = new Set<string>()
  for (const page of allPages(m)) {
    for (const v of page.views) owned.add(v.code)
    for (const a of page.actions ?? []) owned.add(a.code)
  }
  for (const s of m.standalonePermissions) owned.add(s.code)
  return owned
}

// ── picker 樹衍生 ──

export interface PickerNode {
  code: string
  label: string
  /** 後端 definition.scope_options（非空才渲染 scope radio）；元件端可再 fallback SCOPE_AWARE_CODES。 */
  scopeOptions: string[]
  /** sharedViews 借道本碼的頁面 title（picker 灰字「同時開通：…」）。 */
  sharedPageTitles: string[]
}

export interface PickerPage {
  key: string
  title: string
  views: PickerNode[]
  actions: (PickerNode & { requiresView?: string })[]
}

export interface PickerGroup {
  key: string
  title: string
  pages: PickerPage[]
  /** 群組級聯勾選對象：全部頁面 views 碼（不含 actions，最小授權）。 */
  viewCodes: string[]
  /** 群組取消時要清掉的全部 owned 碼（views + actions）。 */
  ownedCodes: string[]
}

/**
 * 後端 GET /auth/permissions 回傳的 definition 最小結構需求
 * （結構相容 PermissionPicker.vue 的 PermissionPickerDefinition；在此另定義
 * 避免 constants → components 的反向依賴）。
 */
export interface PickerDefinitionLike {
  permissions: Record<string, { label?: string | null; scope_options?: string[] | null }>
}

/**
 * join 後端 definition：label/scope_options 以後端為準、manifest label 為 fallback、
 * 最後 fallback code；definition.permissions 中不被任何 owned/standalone 涵蓋的碼
 * → 自動附加「其他權限（未分類）」尾端群組（孤兒不得靜默消失）；manifest 有、
 * definition 沒有的碼（後端落後）照常渲染；views 與 actions 皆空的頁
 * （純 sharedViews 頁）不產生 picker 節點。standalonePermissions 亦歸尾端群組顯示。
 */
export function derivePickerTree(m: NavigationManifest, definition: PickerDefinitionLike): PickerGroup[] {
  // code → 借道它的頁面 titles
  const sharedTitles = new Map<string, string[]>()
  for (const page of allPages(m)) {
    for (const code of page.sharedViews ?? []) {
      const titles = sharedTitles.get(code) ?? []
      titles.push(page.title)
      sharedTitles.set(code, titles)
    }
  }

  const makeNode = (code: string, fallbackLabel?: string): PickerNode => {
    const def = definition.permissions[code]
    return {
      code,
      label: def?.label || fallbackLabel || code,
      scopeOptions: def?.scope_options ?? [],
      sharedPageTitles: sharedTitles.get(code) ?? [],
    }
  }

  const makePage = (page: ManifestPage): PickerPage | null => {
    const actions = page.actions ?? []
    if (page.views.length === 0 && actions.length === 0) return null
    return {
      key: page.key,
      title: page.title,
      views: page.views.map((v) => makeNode(v.code, v.label)),
      actions: actions.map((a) => ({
        ...makeNode(a.code, a.label),
        ...(a.requiresView ? { requiresView: a.requiresView } : {}),
      })),
    }
  }

  const makeGroup = (key: string, title: string, pages: readonly ManifestPage[]): PickerGroup | null => {
    const pickerPages = pages.map(makePage).filter((p): p is PickerPage => p !== null)
    if (pickerPages.length === 0) return null
    return {
      key,
      title,
      pages: pickerPages,
      viewCodes: pickerPages.flatMap((p) => p.views.map((v) => v.code)),
      ownedCodes: pickerPages.flatMap((p) => [
        ...p.views.map((v) => v.code),
        ...p.actions.map((a) => a.code),
      ]),
    }
  }

  const groups: PickerGroup[] = []
  // topLevel 頁（儀表板/工作台）收進固定首群組，碼才不會從 picker 消失。
  const top = makeGroup('topLevel', '總覽與工作台', m.topLevel)
  if (top) groups.push(top)
  for (const g of m.groups) {
    const built = makeGroup(g.key, g.title, g.pages)
    if (built) groups.push(built)
  }

  // 尾端「其他權限（未分類）」：standalone 豁免碼 + 後端有、manifest 沒有的孤兒碼。
  const owned = collectOwnedCodes(m)
  const orphanCodes = Object.keys(definition.permissions)
    .filter((code) => !owned.has(code))
    .sort()
  const tailNodes: PickerNode[] = [
    ...m.standalonePermissions.map((s) => makeNode(s.code, s.label)),
    ...orphanCodes.map((code) => makeNode(code)),
  ]
  if (tailNodes.length > 0) {
    groups.push({
      key: 'uncategorized',
      title: '其他權限（未分類）',
      // 頁 title 留空：這群組只有一頁，群組標題已載明語意，頁名再重複一次同樣文字
      // 只是雜訊（picker 會保留等寬佔位，欄位對齊不受影響）。
      pages: [{ key: 'uncategorized', title: '', views: tailNodes, actions: [] }],
      viewCodes: tailNodes.map((n) => n.code),
      ownedCodes: tailNodes.map((n) => n.code),
    })
  }
  return groups
}
