import { formatCurrency } from '@/utils/currency'

/**
 * 下學期（2–7 月）超額獎金 7 月表外批次（義華 Q11）的前端純邏輯。
 * 後端權威：api/extra_bonuses.py semester2-excess、services/semester2_excess_payout。
 */

/**
 * 預設民國學年：最近一個「已開始」的下學期。下學期＝學年次年 2–7 月，
 * 所以西元年 Y 的 2–7 月屬於 (Y − 1912) 學年；8 月後的上學期期間，最近一個
 * 下學期也是同一個 (Y − 1912)。1 月則是前一年 2–7 月那學期，同為 (Y − 1912)。
 */
export function defaultSemester2AcademicYear(d: Date = new Date()): number {
  return d.getFullYear() - 1912
}

/** 下學期期間文字：「116 年 2–7 月」（民國）。 */
export function semester2PeriodLabel(academicYear: number): string {
  return `${academicYear + 1} 年 2–7 月`
}

/** 逐月明細 {"116-02": "1200"} → 依月份排序的顯示列。 */
export function sortedMonthEntries(months: Record<string, string> | null | undefined): { ym: string; value: string }[] {
  return Object.entries(months ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, value]) => ({ ym, value }))
}

interface Brief {
  employee_name: string
  /** 被移除那筆系統列的金額（removed_* 清單才有意義） */
  amount?: number
}
export interface ApplyResultLike {
  created: Brief[]
  updated: Brief[]
  deleted: Brief[]
  skipped_manual: Brief[]
  skipped_self: Brief[]
  /** 同員工重複的系統列被去重（舊後端沒有這兩欄） */
  removed_duplicates?: Brief[]
  /** 人工列已存在，因而被刪除的系統列 */
  removed_for_manual?: Brief[]
  total_amount: number
}

/** 套用結果摘要（不含金額格式，由呼叫端補）。 */
export function applyResultCountsText(r: ApplyResultLike): string {
  const parts = [`新增 ${r.created.length} 位`, `更新 ${r.updated.length} 位`, `移除 ${r.deleted.length} 位`]
  if (r.skipped_manual.length > 0) parts.push(`已有人工登錄跳過 ${r.skipped_manual.length} 位`)
  if (r.skipped_self.length > 0) parts.push(`本人須由他人執行 ${r.skipped_self.length} 位`)
  if ((r.removed_for_manual?.length ?? 0) > 0) parts.push(`因人工登錄移除系統列 ${r.removed_for_manual!.length} 位`)
  if ((r.removed_duplicates?.length ?? 0) > 0) parts.push(`去除重複系統列 ${r.removed_duplicates!.length} 位`)
  return parts.join('、')
}

/** 「王老師 NT$1,200、李老師 NT$800」；沒有金額時只列姓名。 */
export function removedBriefsText<B extends Brief>(list: B[], nameOf: (b: B) => string = (b) => b.employee_name): string {
  return list
    .map((b) => (typeof b.amount === 'number' ? `${nameOf(b)} ${formatCurrency(b.amount)}` : nameOf(b)))
    .join('、')
}

/** 套用結果中被系統移除的列（金額一併列出，讓承辦人核對），沒有則回空陣列。 */
export function removalDescriptionParts<B extends Brief>(
  r: { removed_for_manual?: B[]; removed_duplicates?: B[] },
  nameOf?: (b: B) => string,
): string[] {
  const parts: string[] = []
  if ((r.removed_for_manual?.length ?? 0) > 0) {
    parts.push(`已有人工登錄，已移除系統產生的重複列：${removedBriefsText(r.removed_for_manual!, nameOf)}`)
  }
  if ((r.removed_duplicates?.length ?? 0) > 0) {
    parts.push(`重複的系統產生列已去除（保留最早一筆）：${removedBriefsText(r.removed_duplicates!, nameOf)}`)
  }
  return parts
}

/** 預覽列中「人工列與系統產生列並存」的筆數（套用時系統列會被移除，避免重複發放）。 */
export function coexistCount(rows: { auto_and_manual_coexist?: boolean }[]): number {
  return rows.filter((r) => r.auto_and_manual_coexist === true).length
}

/** 套用確認文案的補充句；沒有並存列時回空字串。 */
export function coexistConfirmNote(count: number): string {
  return count > 0 ? `其中 ${count} 位同時有人工登錄與系統產生的列，套用時會移除系統列（人工優先、不重複發放）。` : ''
}
