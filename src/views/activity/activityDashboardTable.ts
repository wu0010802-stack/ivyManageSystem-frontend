/**
 * 才藝儀表板表格的純函式 helper（自 ActivityDashboardView.vue 抽出，供單元測試）。
 */

/**
 * 「達成獎金」欄顯示值。
 *
 * 後端 `grade.subtotal.bonus` 語意為「年級**報名達標率** >= target_pct 時給予的
 * 獎金額」（GRADE_TARGET_BONUS=1000），各年級門檻為大班 100 / 中班 90 /
 * 小班 80 / 幼幼班 70。
 *
 * ⚠ 原實作寫 `bonus === FULL_ATTENDANCE_BONUS ? '100%' : ''`，把達標渲染成字串
 * '100%' 放進標題為「達成獎金 +1000」的欄位——一個 90% 達標的中班，班導看到的是
 * 「達成獎金 +1000 → 100%」，誤導成「全班 100% 參加」。且 bonus 跟出席率無關、
 * 跟 100% 無關（根因是常數被誤命名為 FULL_ATTENDANCE_BONUS「滿勤獎金」）。
 * 改為照實顯示獎金額，後端日後調整金額也不需改前端。
 */
export function buildBonusLabel(bonus: number | undefined | null): string {
  if (!bonus || bonus <= 0) return ''
  return `+${bonus}`
}
