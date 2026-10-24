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
}
export interface ApplyResultLike {
  created: Brief[]
  updated: Brief[]
  deleted: Brief[]
  skipped_manual: Brief[]
  skipped_self: Brief[]
  total_amount: number
}

/** 套用結果摘要（不含金額格式，由呼叫端補）。 */
export function applyResultCountsText(r: ApplyResultLike): string {
  const parts = [`新增 ${r.created.length} 位`, `更新 ${r.updated.length} 位`, `移除 ${r.deleted.length} 位`]
  if (r.skipped_manual.length > 0) parts.push(`已有人工登錄跳過 ${r.skipped_manual.length} 位`)
  if (r.skipped_self.length > 0) parts.push(`本人須由他人執行 ${r.skipped_self.length} 位`)
  return parts.join('、')
}
