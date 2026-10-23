/**
 * 節慶獎金「發放月 → 涵蓋累積月份」對照。
 *
 * 單一來源（後端）：services/salary/utils.get_distribution_period_months
 *   2 月發放  → 去年 12 月 + 1 月（春節）
 *   6 月發放  → 2-5 月（端午）
 *   9 月發放  → 6-8 月（中秋）
 *   12 月發放 → 9-11 月（年終）
 * 此處為前端顯示用文字對照；月份集合屬固定歷法慣例，與後端規則改動時須同步。
 */
export function festivalCoverageLabel(month: number): string | null {
  switch (month) {
    case 2:
      return '12～1 月'
    case 6:
      return '2～5 月'
    case 9:
      return '6～8 月'
    case 12:
      return '9～11 月'
    default:
      return null
  }
}

// ── 發放薪資月（per-tenant 口徑）────────────────────────────────────────────
// 對齊後端 services/salary/festival_payout.FestivalPayoutPolicy（義華 2026-10-22 Q10）：
// 「批次」仍以標準發放月 2／6／9／12 識別；租戶設定 festival.early_payout_from_ym＝E 後，
// 「最後一個期間月 ≥ E」的批次改隨期間最後一個月的薪資發放（2→1、6→5、9→8、12→11）。
// 以批次判定而非以薪資月判定，所以 E 落在任何月份每批都恰好發一次。
// 權威仍是後端（period-accrual 的 is_distribution_month、enrollment-snapshot 的
// covered_months、calculate 端點 422）；此處只供前端顯示與預先禁用按鈕。

export const STANDARD_FESTIVAL_BATCH_MONTHS: readonly number[] = [2, 6, 9, 12]

type YearMonth = readonly [number, number]

const ymKey = (year: number, month: number): number => year * 100 + month
const prevMonth = (year: number, month: number): YearMonth =>
  month === 1 ? [year - 1, 12] : [year, month - 1]
const nextMonth = (year: number, month: number): YearMonth =>
  month === 12 ? [year + 1, 1] : [year, month + 1]

/** 解析 `YYYY-MM`；空值或格式不符回 null（＝標準口徑）。 */
export function parseYearMonth(value: string | null | undefined): YearMonth | null {
  if (!value) return null
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value.trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2])]
}

function batchIsEarly(batchYear: number, batchMonth: number, earlyFrom: YearMonth | null): boolean {
  if (!earlyFrom) return false
  const [ly, lm] = prevMonth(batchYear, batchMonth)
  return ymKey(ly, lm) >= ymKey(earlyFrom[0], earlyFrom[1])
}

/** 該薪資月發放哪一批（回批次的標準發放年月）；非發放月回 null。 */
export function festivalBatchForSalaryMonth(
  year: number,
  month: number,
  earlyPayoutFromYm: string | null | undefined,
): YearMonth | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  const earlyFrom = parseYearMonth(earlyPayoutFromYm)
  if (STANDARD_FESTIVAL_BATCH_MONTHS.includes(month) && !batchIsEarly(year, month, earlyFrom)) {
    return [year, month]
  }
  const [ny, nm] = nextMonth(year, month)
  if (STANDARD_FESTIVAL_BATCH_MONTHS.includes(nm) && batchIsEarly(ny, nm, earlyFrom)) {
    return [ny, nm]
  }
  return null
}

/** 該薪資月是否為節慶發放月（依租戶口徑）。 */
export function isFestivalPayoutMonth(
  year: number,
  month: number,
  earlyPayoutFromYm: string | null | undefined,
): boolean {
  return festivalBatchForSalaryMonth(year, month, earlyPayoutFromYm) !== null
}

/** 發放薪資月對應的涵蓋期間文字（依租戶口徑）；非發放月回 null。 */
export function festivalCoverageLabelForSalaryMonth(
  year: number,
  month: number,
  earlyPayoutFromYm: string | null | undefined,
): string | null {
  const batch = festivalBatchForSalaryMonth(year, month, earlyPayoutFromYm)
  return batch ? festivalCoverageLabel(batch[1]) : null
}

/** 某年內的節慶發放薪資月清單（切換當年可能混合兩種口徑，如 2／6／9／11）。 */
export function festivalPayoutMonthsInYear(
  year: number,
  earlyPayoutFromYm: string | null | undefined,
): number[] {
  const months: number[] = []
  for (let m = 1; m <= 12; m++) {
    if (isFestivalPayoutMonth(year, m, earlyPayoutFromYm)) months.push(m)
  }
  return months
}

/** 顯示用：「2／6／9／12 月」。 */
export function festivalPayoutMonthsText(
  year: number,
  earlyPayoutFromYm: string | null | undefined,
): string {
  return `${festivalPayoutMonthsInYear(year, earlyPayoutFromYm).join('／')} 月`
}
