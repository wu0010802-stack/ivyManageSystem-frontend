/**
 * 出勤明細名冊的排序與分組（RosterColumn 畫面順序的單一來源）。
 *
 * 頁面預設選的人要是名冊畫面上的第一位：之前取後端原順序的第一筆，排序分組後那個人常在
 * 第 7 位、首屏外，右側卻顯示他的明細，看不出是誰。
 */
import type { RosterRow } from '@/composables/useAttendanceWorkspace'

/** 月統計的異常數（遲到＋早退＋缺上下班卡） */
export function rosterAnomalyCount(r: RosterRow): number {
  return r.late_count + r.early_leave_count + r.missing_punch_in + r.missing_punch_out
}

/** 尚待處理的異常數：有 pendingCounts（key＝員工編號）就用它，否則退回月統計數 */
export function rosterPendingCount(r: RosterRow, pendingCounts?: Record<string, number>): number {
  if (!pendingCounts) return rosterAnomalyCount(r)
  return pendingCounts[r.employee_number ?? ''] ?? 0
}

/** 搜尋（姓名或工號）後依異常數遞減、姓名排序 */
export function sortRoster(roster: readonly RosterRow[], query = ''): RosterRow[] {
  const q = query.trim().toLowerCase()
  const filtered = q
    ? roster.filter((r) => r.employee_name.toLowerCase().includes(q) || (r.employee_number?.toLowerCase().includes(q) ?? false))
    : [...roster]
  return filtered.sort((a, b) => {
    const diff = rosterAnomalyCount(b) - rosterAnomalyCount(a)
    if (diff !== 0) return diff
    return a.employee_name.localeCompare(b.employee_name, 'zh-TW')
  })
}

export interface RosterGroup {
  key: 'pending' | 'clean' | 'no-summary'
  label: string
  rows: RosterRow[]
}

/** 「有待辦 → 無待辦 → 尚無打卡」分組；組內沿用 sortRoster 的順序 */
export function groupRoster(sorted: readonly RosterRow[], pendingCounts?: Record<string, number>): RosterGroup[] {
  const pending: RosterRow[] = []
  const clean: RosterRow[] = []
  const noSummary: RosterRow[] = []
  for (const row of sorted) {
    if (row.has_summary === false) noSummary.push(row)
    else if (rosterPendingCount(row, pendingCounts) > 0) pending.push(row)
    else clean.push(row)
  }
  return [
    { key: 'pending', label: '有待辦', rows: pending },
    // 「無待辦」而非「無異常」：本月有過異常但已接受扣款／豁免的人也歸在這裡
    { key: 'clean', label: '無待辦', rows: clean },
    { key: 'no-summary', label: '尚無打卡', rows: noSummary },
  ]
}

/** 名冊畫面上的第一位（沒搜尋時）；名冊空的＝null */
export function firstRosterEmployeeId(roster: readonly RosterRow[], pendingCounts?: Record<string, number>): number | null {
  return groupRoster(sortRoster(roster), pendingCounts).flatMap((g) => g.rows)[0]?.employee_id ?? null
}
