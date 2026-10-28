/**
 * 考核名冊已發放標記（義華 2026-10-27）的前端純邏輯。
 *
 * 後端權威：ivy-backend `api/appraisal/cycles.py`（POST／DELETE `/appraisal/cycles/{id}/roster-paid`）。
 * 只有已封存（CLOSED）的週期可由 `APPRAISAL_ACCOUNTING` 標記；標記後年終考核 payout
 * 不再為該半年產生 `APPRAISAL_HALF_BONUS_*` 明細，避免已另循名冊轉帳的獎金年終又發一次。
 */
import { formatTaipeiDateTimeMinute } from '@/utils/format'
import { sourceAcademicYearToPayoutYear } from '@/utils/academic'

export interface RosterPaidCycleLike {
  academic_year?: number
  semester?: string
  status?: string
  roster_paid_at?: string | null
  roster_paid_by?: string | null
  roster_paid_note?: string | null
}

export function isRosterPaid(cycle: RosterPaidCycleLike | null | undefined): boolean {
  return !!cycle?.roster_paid_at
}

/** 後端：僅 CLOSED 可標記、重複標記 409。前端在此就不顯示無效入口。 */
export function canMarkRosterPaid(
  cycle: RosterPaidCycleLike | null | undefined,
  hasAccountingPermission: boolean,
): boolean {
  return !!cycle && hasAccountingPermission && cycle.status === 'CLOSED' && !isRosterPaid(cycle)
}

/** 後端：尚未標記時取消回 409。 */
export function canUnmarkRosterPaid(
  cycle: RosterPaidCycleLike | null | undefined,
  hasAccountingPermission: boolean,
): boolean {
  return !!cycle && hasAccountingPermission && isRosterPaid(cycle)
}

/** 已發放標記的一行摘要；未標記回空字串。時間一律以台北時間顯示到分鐘。 */
export function rosterPaidSummary(cycle: RosterPaidCycleLike | null | undefined): string {
  if (!cycle || !isRosterPaid(cycle)) return ''
  let text = `名冊已發放：${formatTaipeiDateTimeMinute(cycle.roster_paid_at)}`
  if (cycle.roster_paid_by) text += ` 由 ${cycle.roster_paid_by} 標記`
  if (cycle.roster_paid_note) text += `（${cycle.roster_paid_note}）`
  return text
}

function cycleLabel(cycle: RosterPaidCycleLike): string {
  return `${cycle.academic_year ?? ''} 學年${cycle.semester === 'FIRST' ? '上學期' : '下學期'}`
}

/** 標記前的確認文案：講清楚對年終發放的影響。 */
export function markRosterPaidMessage(cycle: RosterPaidCycleLike): string {
  return (
    `確定將「${cycleLabel(cycle)}」的考核獎金標記為已另循名冊發放？` +
    '標記後，年終考核獎金發放不會再為這個學期建立發放明細，避免重複發放；' +
    '已經建立的發放明細不會自動刪除，需要時請先到年終考核獎金頁清空。'
  )
}

/** 考核年終 payout 的發放年（西元）：來源學年 = 發放年 − 1913（上、下學期週期的 academic_year 相同）。 */
export function payoutYearForCycle(academicYear: number): number {
  return sourceAcademicYearToPayoutYear(academicYear)
}

/** 「考核年終獎金」頁的位置，帶上該週期所屬的發放年，讓承辦人直接在對的年度作廢明細。 */
export function payoutVoidLocation(cycle: RosterPaidCycleLike): { path: string; query?: { year: string } } {
  return cycle.academic_year != null
    ? { path: '/year-end/appraisal-payout', query: { year: String(payoutYearForCycle(cycle.academic_year)) } }
    : { path: '/year-end/appraisal-payout' }
}

/**
 * 標記遭 409 拒絕，且原因是「該半年的年終明細已存在」（需先作廢再標記）。
 * `message` 是經 apiError 取出的後端說明（不直接讀回應內容，見 error-detail 棘輪）。
 * 同樣回 409 的「此週期已標記」「週期不是 CLOSED」不屬此類，不應引導去作廢。
 */
export function isPayoutExistsConflict(error: unknown, message: string): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  return status === 409 && message.includes('作廢')
}
