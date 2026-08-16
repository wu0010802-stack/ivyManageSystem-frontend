import type { BreadcrumbParent } from '@/constants/navigation'

export interface BreadcrumbResolveContext {
  /** 父層候選表，須已依 path 長度降冪排序（BREADCRUMB_PARENTS 的契約）。 */
  parents: readonly BreadcrumbParent[]
  /** 該路徑對應的路由是否為純 redirect 容器（點下去會被轉走）。 */
  isContainer: (path: string) => boolean
  /** 以路徑取路由 meta.title，供 meta.parent 指向非選單項時取顯示文字。 */
  titleOf: (path: string) => string
  /** route.meta.parent 明示的父層路徑。 */
  metaParent?: string
}

/**
 * 解析當前路徑的麵包屑父層。四條規則依序判定（spec §3.1）：
 * 1. 自己是側邊欄項目 → 無父層（一級頁）
 * 2. meta.parent 明示
 * 3. 最長前綴反查（parents 已降冪，第一個命中即最長）
 * 4. 父層是 redirect 容器 → 撤銷
 *
 * 不變式：**回傳非 null 者一律可點且點得到實質頁面**——這是「頂列出現的父層
 * 一律可點」這條 UX 規則的實作保證。放寬它就會退回本次要修的問題：使用者
 * 分不出哪個灰字能點。
 */
export function resolveBreadcrumbParent(
  path: string,
  ctx: BreadcrumbResolveContext,
): BreadcrumbParent | null {
  // 規則 1：自己就是側邊欄項目 → 無父層
  if (ctx.parents.some((p) => p.path === path)) return null

  let candidate: BreadcrumbParent | null = null

  if (ctx.metaParent) {
    // 規則 2：meta.parent 明示（顯示文字：選單項 title 優先，否則取目標路由 meta.title）
    const known = ctx.parents.find((p) => p.path === ctx.metaParent)
    const title = known?.title || ctx.titleOf(ctx.metaParent)
    candidate = title ? { path: ctx.metaParent, title } : null
  } else {
    // 規則 3：最長前綴反查。要求尾隨 '/' 才算子路徑，
    // 否則 /student-attendance 會誤配到 /students。
    candidate = ctx.parents.find((p) => path.startsWith(`${p.path}/`)) ?? null
  }

  if (!candidate) return null

  // 規則 4：redirect 容器撤銷。這類父層點下去會被守衛轉走，
  // 常落回使用者原本那頁 = 點了沒反應。
  if (ctx.isContainer(candidate.path)) return null

  return candidate
}
