/**
 * /attendance（出勤核對）與 /schedule（排班）的 query → 頁面 props。
 *
 * 2026-10-29 後台 IA 重整 批次 3（S3）：原「排班與出勤」單頁（SPEC-027）拆回兩個側欄頁，
 * 兩條路由共用同一個元件 ScheduleAttendanceView，以 `scope` prop 鎖定只顯示一半：
 * - /attendance（scope=attendance）：核對（ATTENDANCE_READ）。tab／view／filter／emp／date 照舊。
 * - /schedule（scope=schedule）：排班（SCHEDULE）。`?sub=` 選週班表（預設）／rotation／swaps／shifts，`?date=`。
 *
 * - tab：grid（核對）／schedule（排班）；只在 /attendance 有意義。tab 解析出 schedule 的舊連結
 *   （tab=schedule／rotation／swaps／shifts）由 authGuard 的 legacyAttendanceScheduleRedirect
 *   在權限檢查之前轉到 /schedule（見該函式）
 * - sub：排班的子頁籤 week（週班表，預設）／rotation／swaps／shifts
 * - view：核對的檢視 week（預設）／month（月格子，桌機限定；手機由頁面強制週）／person（逐人）；非法值退回週
 * - 舊連結相容（2026-10 頁籤由五個收成兩個）：
 *   tab=records（原「出勤明細」）＝ tab=grid＋view=person；
 *   tab=reconcile（原「打卡核對」）＝ tab=grid＋filter=issues；
 *   /settings?tab=shifts（原「設定 › 輪班別管理」）＝ /schedule?sub=shifts（legacySettingsShiftsRedirect）
 * - date：YYYY-MM-DD；emp：員工 id（開頁即開該人 date 那天的格子抽屜；view=person 時改為選取該人的逐人明細）
 * - filter：all／issues（有待辦）／patterns（設定問題）／leftover（封存時未處理）／future（排班用）；
 *   選到這個情境沒有的選項（例如封存月的 issues）由格子面板退回 all 並改寫網址
 */
import type { LocationQuery } from 'vue-router'

const TABS = ['grid', 'schedule'] as const
const SUBS = ['week', 'rotation', 'swaps', 'shifts'] as const
const FILTERS = ['all', 'issues', 'patterns', 'future', 'leftover'] as const
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
 * 舊書籤 /settings?tab=shifts → /schedule?sub=shifts。
 *
 * 必須在 authGuard 權限檢查之前呼叫：班別搬走後 /settings 不再借道 SCHEDULE，
 * 只有 SCHEDULE 的角色（園長／主任）打舊連結會先被 /settings 擋成 403。
 * 路由層 redirect 不能用：/settings 本身有元件，同 path 依 query 分流只能在守衛做。
 */
export function legacySettingsShiftsRedirect(to: { path: string; query: LocationQuery }): {
  path: '/schedule'
  query: { sub: 'shifts' }
} | null {
  if (to.path !== '/settings' || first(to.query.tab) !== 'shifts') return null
  return { path: '/schedule', query: { sub: 'shifts' } }
}

/**
 * 舊 /attendance?tab=schedule|rotation|swaps|shifts（含 BE 通知／儀表板 deep_link
 * `/attendance?tab=swaps`、書籤）→ /schedule。保留子頁籤與合法的 date，其餘 query 丟掉
 *（emp／filter／view 都是核對的）。
 *
 * 與 legacySettingsShiftsRedirect 同理放在 authGuard、權限檢查之前，兩個原因：
 * ① 只持 SCHEDULE 的人打舊連結，/attendance 已不再借道 SCHEDULE，不先轉會被擋成 403；
 * ② 已停在 /attendance 時站內再 push `/attendance?tab=swaps`（例如通知面板）是同一筆路由記錄的
 *    query 變更，路由層 beforeEnter／redirect 不會觸發，只有全域守衛每次導航都會跑。
 */
export function legacyAttendanceScheduleRedirect(to: { path: string; query: LocationQuery }): {
  path: '/schedule'
  query: { sub?: AttendanceSub; date?: string }
} | null {
  if (to.path !== '/attendance') return null
  const resolved = resolveTab(first(to.query.tab), first(to.query.sub))
  if (resolved.tab !== 'schedule') return null
  const date = first(to.query.date)
  const query: { sub?: AttendanceSub; date?: string } = {}
  if (resolved.sub && resolved.sub !== 'week') query.sub = resolved.sub
  if (isValidDateQuery(date)) query.date = date
  return { path: '/schedule', query }
}

/**
 * 只持 SCHEDULE、無 ATTENDANCE_READ 的人開舊 /attendance（不帶排班頁籤，例如舊側欄入口的書籤）：
 * 拆頁前 /attendance 借道 SCHEDULE、會直接落在排班頁籤；拆頁後改落 /schedule（帶合法 date），
 * 而不是被擋成 403。authGuard 只在 canAccessRoute('/attendance') 為 false、'/schedule' 為 true 時呼叫。
 */
export function scheduleFallbackForAttendance(to: { query: LocationQuery }): {
  path: '/schedule'
  query: { date?: string }
} {
  const date = first(to.query.date)
  return { path: '/schedule', query: isValidDateQuery(date) ? { date } : {} }
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

/** 兩個頁面各自鎖定的範圍（ScheduleAttendanceView 的 scope prop）。 */
export type AttendanceScope = 'attendance' | 'schedule'

/** /attendance（出勤核對）的頁面 props：核對那一半。 */
export function attendancePageProps(query: LocationQuery): ReturnType<typeof attendanceRouteProps> & {
  scope: 'attendance'
} {
  return { ...attendanceRouteProps(query), scope: 'attendance' }
}

/** /schedule（排班）的頁面 props：只有 sub 與 date；tab 固定 schedule。舊的 tab=rotation／swaps／shifts 值也認得。 */
export function schedulePageProps(query: LocationQuery): {
  scope: 'schedule'
  tab: 'schedule'
  sub: AttendanceSub
  date?: string
} {
  const legacy = resolveTab(first(query.tab), first(query.sub))
  const date = first(query.date)
  return {
    scope: 'schedule',
    tab: 'schedule',
    sub: oneOf(SUBS, first(query.sub)) ?? legacy.sub ?? 'week',
    date: isValidDateQuery(date) ? date : undefined,
  }
}
