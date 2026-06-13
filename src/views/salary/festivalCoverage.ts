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
