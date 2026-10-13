/**
 * /attendance（排班與出勤，SPEC-027 §6.1）的 query → 頁面 props。
 *
 * - tab：grid（預設）／records／rotation／swaps／shifts
 * - 舊連結相容：tab=reconcile（原「打卡核對」）＝ tab=grid＋filter=issues；
 *   /settings?tab=shifts（原「設定 › 輪班別管理」）＝ tab=shifts（legacySettingsShiftsRedirect）
 * - date：YYYY-MM-DD；emp：員工 id（開頁即開該人 date 那天的格子抽屜）
 * - filter：all／issues／future
 */
import type { LocationQuery } from 'vue-router'

const TABS = ['grid', 'records', 'rotation', 'swaps', 'shifts'] as const
const FILTERS = ['all', 'issues', 'future'] as const
export type AttendanceTab = (typeof TABS)[number]
export type AttendanceFilter = (typeof FILTERS)[number]

export function isValidDateQuery(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`))
}

const first = (value: LocationQuery[string]): string | undefined =>
  (Array.isArray(value) ? value[0] : value) ?? undefined

/**
 * 舊書籤 /settings?tab=shifts → /attendance?tab=shifts。
 *
 * 必須在 authGuard 權限檢查之前呼叫：班別搬走後 /settings 不再借道 SCHEDULE，
 * 只有 SCHEDULE 的角色（園長／主任）打舊連結會先被 /settings 擋成 403。
 * 路由層 redirect 不能用：/settings 本身有元件，同 path 依 query 分流只能在守衛做。
 */
export function legacySettingsShiftsRedirect(to: { path: string; query: LocationQuery }): {
  path: '/attendance'
  query: { tab: 'shifts' }
} | null {
  if (to.path !== '/settings' || first(to.query.tab) !== 'shifts') return null
  return { path: '/attendance', query: { tab: 'shifts' } }
}

export function attendanceRouteProps(query: LocationQuery): {
  tab?: AttendanceTab
  date?: string
  emp?: number
  filter?: AttendanceFilter
} {
  const rawTab = first(query.tab)
  const rawFilter = first(query.filter)
  const legacyReconcile = rawTab === 'reconcile'
  const tab = legacyReconcile ? 'grid' : (TABS as readonly string[]).includes(rawTab ?? '') ? (rawTab as AttendanceTab) : undefined
  const filter = legacyReconcile
    ? 'issues'
    : (FILTERS as readonly string[]).includes(rawFilter ?? '') ? (rawFilter as AttendanceFilter) : undefined
  const date = first(query.date)
  const emp = Number(first(query.emp))
  return {
    tab,
    date: isValidDateQuery(date) ? date : undefined,
    emp: Number.isInteger(emp) && emp > 0 ? emp : undefined,
    filter,
  }
}
