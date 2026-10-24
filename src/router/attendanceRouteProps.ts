/**
 * /attendance（排班與出勤，SPEC-027 §6.1）的 query → 頁面 props。
 *
 * - tab：grid（核對）／schedule（排班）；沒帶由頁面取第一個看得到的頁籤
 * - sub：排班頁籤的子頁籤 week（週班表，預設）／rotation／swaps／shifts；只屬於 tab=schedule
 * - view：核對頁籤的檢視 week（預設）／month（月格子，桌機限定；手機由頁面強制週）／person（逐人）；非法值退回週
 * - 舊連結相容（2026-10 頁籤由五個收成兩個）：
 *   tab=records（原「出勤明細」）＝ tab=grid＋view=person；
 *   tab=rotation／swaps／shifts ＝ tab=schedule＋同名 sub；
 *   tab=reconcile（原「打卡核對」）＝ tab=grid＋filter=issues；
 *   /settings?tab=shifts（原「設定 › 輪班別管理」）＝ tab=shifts（legacySettingsShiftsRedirect）
 * - date：YYYY-MM-DD；emp：員工 id（開頁即開該人 date 那天的格子抽屜）
 * - filter：all／issues／future（核對頁籤）
 */
import type { LocationQuery } from 'vue-router'

const TABS = ['grid', 'schedule'] as const
const SUBS = ['week', 'rotation', 'swaps', 'shifts'] as const
const FILTERS = ['all', 'issues', 'future'] as const
const VIEWS = ['week', 'month', 'person'] as const
/** 舊頁籤值（rotation／swaps／shifts）直接是排班頁籤的子頁籤 */
const LEGACY_SCHEDULE_TABS: readonly string[] = ['rotation', 'swaps', 'shifts']
export type AttendanceTab = (typeof TABS)[number]
export type AttendanceSub = (typeof SUBS)[number]
export type AttendanceFilter = (typeof FILTERS)[number]
export type AttendanceView = (typeof VIEWS)[number]

export function isValidDateQuery(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`))
}

const first = (value: LocationQuery[string]): string | undefined =>
  (Array.isArray(value) ? value[0] : value) ?? undefined

const oneOf = <T extends string>(values: readonly T[], value: string | undefined): T | undefined =>
  (values as readonly string[]).includes(value ?? '') ? (value as T) : undefined

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

/** tab（含舊值）→ 頁籤＋它帶出的子頁籤／檢視／篩選 */
function resolveTab(rawTab: string | undefined, rawSub: string | undefined): {
  tab?: AttendanceTab
  sub?: AttendanceSub
  view?: 'person'
  filter?: 'issues'
} {
  if (rawTab === 'records') return { tab: 'grid', view: 'person' }
  if (rawTab === 'reconcile') return { tab: 'grid', filter: 'issues' }
  if (rawTab && LEGACY_SCHEDULE_TABS.includes(rawTab)) return { tab: 'schedule', sub: rawTab as AttendanceSub }
  if (rawTab === 'schedule') return { tab: 'schedule', sub: oneOf(SUBS, rawSub) ?? 'week' }
  return { tab: oneOf(TABS, rawTab) }
}

export function attendanceRouteProps(query: LocationQuery): {
  tab?: AttendanceTab
  sub?: AttendanceSub
  date?: string
  emp?: number
  filter?: AttendanceFilter
  view?: AttendanceView
} {
  const legacy = resolveTab(first(query.tab), first(query.sub))
  const rawView = first(query.view)
  const date = first(query.date)
  const emp = Number(first(query.emp))
  return {
    tab: legacy.tab,
    sub: legacy.sub,
    date: isValidDateQuery(date) ? date : undefined,
    emp: Number.isInteger(emp) && emp > 0 ? emp : undefined,
    filter: legacy.filter ?? oneOf(FILTERS, first(query.filter)),
    view: legacy.view ?? (rawView === undefined ? undefined : oneOf(VIEWS, rawView) ?? 'week'),
  }
}
