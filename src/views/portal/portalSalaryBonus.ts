/**
 * 教師端薪資查詢「獨立獎金淨額」計算。
 *
 * 淨額 = 節慶獎金（festival_bonus）+ 超額獎金（overtime_bonus）。
 *
 * 重要：festival_bonus 已在後端發放月（2/6/9/12）扣除會議缺席扣款
 * （ivy-backend services/salary/engine.py _finalize：
 *   festival_bonus = max(0, festival_bonus - meeting_absence_deduction)），
 * 故此處僅加總，**不可**再減一次 meeting_absence_deduction，否則雙重扣減
 * （教師端會看到比實際撥款更低、甚至負數的金額）。
 */
export function computeIndependentBonusNet(
  salary: Record<string, unknown> | null | undefined,
): number {
  if (!salary) return 0
  return ((salary.festival_bonus as number) || 0) + ((salary.overtime_bonus as number) || 0)
}
