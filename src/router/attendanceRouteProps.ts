/**
 * /attendance（排班與出勤，SPEC-027 §6.1）的 query → 頁面 props。
 *
 * - tab：grid（預設）／records／rotation／swaps
 * - 舊連結相容：tab=reconcile（原「打卡核對」）＝ tab=grid＋filter=issues
 * - date：YYYY-MM-DD；emp：員工 id（開頁即開該人 date 那天的格子抽屜）
 * - filter：all／issues／future
 */
import type { LocationQuery } from 'vue-router'

const TABS = ['grid', 'records', 'rotation', 'swaps'] as const
const FILTERS = ['all', 'issues', 'future'] as const
export type AttendanceTab = (typeof TABS)[number]
export type AttendanceFilter = (typeof FILTERS)[number]

export function isValidDateQuery(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`))
}

const first = (value: LocationQuery[string]): string | undefined =>
  (Array.isArray(value) ? value[0] : value) ?? undefined

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
