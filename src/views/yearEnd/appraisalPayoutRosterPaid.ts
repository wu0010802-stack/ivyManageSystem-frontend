/**
 * 考核年終 payout 對「名冊已發放」半年的前端處理（義華 2026-10-27）。
 *
 * 後端權威：ivy-backend `services/year_end/appraisal_sync.py`。考核週期被標記名冊已發放後，
 * preview 每列帶 `earlier_roster_paid`／`later_roster_paid`（週期層級，每列相同；刻意不放進
 * row.warnings，否則例外中心會把它當 blocking），generate 對該半年不產生發放明細，
 * 並在結果 warnings 加 `appraisal_roster_already_paid:<cycle_id>`。
 */

export interface RosterPaidFlags {
  earlier_roster_paid?: boolean
  later_roster_paid?: boolean
}

export interface RosterPaidAmountRow extends RosterPaidFlags {
  earlier_amount: string
  later_amount: string
  total_amount: string
}

export interface RosterPaidHalves {
  earlier: boolean
  later: boolean
}

const ROSTER_PAID_WARNING_PREFIX = 'appraisal_roster_already_paid:'
const ROSTER_PAID_WARNING_LABEL = '考核獎金已另循名冊發放，未建立該學期的發放資料'

export function rosterPaidHalves(rows: RosterPaidFlags[]): RosterPaidHalves {
  return {
    earlier: rows.some((r) => r.earlier_roster_paid === true),
    later: rows.some((r) => r.later_roster_paid === true),
  }
}

/** 這一列實際會建立發放資料的金額：總額扣掉已另循名冊發放的那半年。無旗標時等於 total_amount。 */
export function payableAmount(row: RosterPaidAmountRow): number {
  let amount = Number(row.total_amount)
  if (row.earlier_roster_paid) amount -= Number(row.earlier_amount)
  if (row.later_roster_paid) amount -= Number(row.later_amount)
  return amount
}

/** 預覽表「合計」欄：無旗標時保留後端字串原樣，有旗標時顯示實際會發放的金額。 */
export function displayTotal(row: RosterPaidAmountRow): string {
  return row.earlier_roster_paid || row.later_roster_paid ? String(payableAmount(row)) : row.total_amount
}

/** 預覽頁頂部提示；兩半都沒標記回 null。 */
export function rosterPaidNotice(
  halves: RosterPaidHalves,
  earlierLabel: string,
  laterLabel: string,
): string | null {
  const paid = [halves.earlier ? earlierLabel : null, halves.later ? laterLabel : null].filter(
    (label): label is string => label !== null,
  )
  if (paid.length === 0) return null
  const names = paid.map((label) => `「${label}」`).join('、')
  if (paid.length === 2) {
    return `${names}的考核獎金都已標記為名冊已發放，這次沒有可建立的發放資料。`
  }
  return `${names}的考核獎金已標記為名冊已發放，建立發放資料時不會產生該學期的明細（避免重複發放），下方金額只計入另一個學期。`
}

/** generate 結果是否有任何半年因名冊已發放被略過。 */
export function hasRosterPaidWarning(codes: string[]): boolean {
  return codes.some((code) => code.startsWith(ROSTER_PAID_WARNING_PREFIX))
}

/** 後端 warning 代碼 → 中文；未知代碼原樣顯示；相同文字只留一句。 */
export function payoutWarningLabels(codes: string[], labels: Record<string, string>): string[] {
  const out: string[] = []
  for (const code of codes) {
    const label = code.startsWith(ROSTER_PAID_WARNING_PREFIX)
      ? ROSTER_PAID_WARNING_LABEL
      : (labels[code] ?? code)
    if (!out.includes(label)) out.push(label)
  }
  return out
}
