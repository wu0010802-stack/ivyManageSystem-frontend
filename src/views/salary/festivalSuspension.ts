/**
 * 節慶停課月登記（義華 2026-10-27，第七篇第七條 3／4）的前端純邏輯。
 * 後端權威：api/salary/festival_suspension.py、services/salary/festival_suspension.py。
 */

/** 規章：停課日（含假日）達此日數即停發；與後端 SUSPENSION_DAYS_THRESHOLD 一致，僅供說明文字。 */
export const SUSPENSION_DAYS_THRESHOLD = 10

/** 全園停課或停課日數達門檻的登記，建立／修改／刪除都要寫明原因（去空白後至少此字數）；對齊後端。 */
export const MIN_TRIGGER_REASON_LENGTH = 10

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** 對齊後端：停課日數為 0–31 的整數，且不可超過當月天數。合法回 null。 */
export function validateSuspendedDays(
  days: number | null | undefined,
  year: number,
  month: number,
): string | null {
  if (days === null || days === undefined || !Number.isInteger(days) || days < 0 || days > 31) {
    return '請輸入 0 到 31 的整數停課日數'
  }
  const monthDays = daysInMonth(year, month)
  if (days > monthDays) {
    return `${year}-${String(month).padStart(2, '0')} 只有 ${monthDays} 天，停課日數不可為 ${days}`
  }
  return null
}

interface StaleLike {
  salary_records?: number
  year_end_settlements?: number[]
  appraisal_summaries?: number[]
}

/** 登記異動後，下游需重算的提醒；沒有（規則未開啟時登記不影響薪資）回 null。 */
export function staleNotice(stale: StaleLike | null | undefined): string | null {
  if (!stale) return null
  const parts: string[] = []
  const salaryRecords = stale.salary_records ?? 0
  if (salaryRecords > 0) parts.push(`已將 ${salaryRecords} 筆未封存薪資標記為需重算`)
  const settlements = stale.year_end_settlements ?? []
  if (settlements.length > 0) {
    parts.push(`有 ${settlements.length} 份年終草稿需要重算（編號 ${settlements.join('、')}）`)
  }
  return parts.length > 0 ? parts.join('；') : null
}

/** 預設登記的年月：今天所在的月份。 */
export function defaultSuspensionPeriod(todayIso: string): { year: number; month: number } {
  return { year: Number(todayIso.slice(0, 4)), month: Number(todayIso.slice(5, 7)) }
}

export function ruleStatusText(ruleEnabled: boolean): string {
  return ruleEnabled
    ? '停發規則已開啟：下面的判定結果會套用到該月的節慶獎金。'
    : '停發規則尚未開啟：登記只是紀錄，不會影響節慶獎金。需要時到「獎金設定」的節慶／超額計算規則開啟。'
}

interface DecisionLike {
  school_reason?: string | null
  classes: unknown[]
}

export type HeadlineType = 'error' | 'warning' | 'success'

/** 判定預覽的一句話結論。 */
export function decisionHeadline(decision: DecisionLike): { type: HeadlineType; text: string } {
  if (decision.school_reason) return { type: 'error', text: `全園停發：${decision.school_reason}` }
  if (decision.classes.length > 0) {
    return { type: 'warning', text: `${decision.classes.length} 個班級會停發節慶獎金` }
  }
  return { type: 'success', text: '這個月沒有班級會被停發' }
}

/** 這筆登記是否會讓節慶獎金停發：全園一律算（不論日數），班級看日數門檻。 */
export function isTriggerRegistration(schoolWide: boolean, days: number | null | undefined): boolean {
  return schoolWide || (days ?? 0) >= SUSPENSION_DAYS_THRESHOLD
}

/**
 * 儲存時原因是否必填。新增只看新值；修改改前或改後任一邊會停發都要
 * （10 日改成 5 日也是在恢復發放）。
 */
export function reasonRequiredForSave(args: {
  schoolWide: boolean
  /** 修改時的原日數；新增不帶 */
  beforeDays?: number | null
  afterDays: number | null | undefined
}): boolean {
  if (isTriggerRegistration(args.schoolWide, args.afterDays)) return true
  return args.beforeDays !== undefined && isTriggerRegistration(args.schoolWide, args.beforeDays)
}

/** 對齊後端 422：去除空白後不足字數回說明，足夠回 null。 */
export function validateTriggerReason(reason: string | null | undefined, action: '登記' | '修改' | '刪除'): string | null {
  if ((reason ?? '').trim().length >= MIN_TRIGGER_REASON_LENGTH) return null
  return (
    `全園停課或停課日數達 ${SUSPENSION_DAYS_THRESHOLD} 日以上會影響節慶獎金，` +
    `${action}須填寫原因／公告依據（去除空白後至少 ${MIN_TRIGGER_REASON_LENGTH} 字）`
  )
}
