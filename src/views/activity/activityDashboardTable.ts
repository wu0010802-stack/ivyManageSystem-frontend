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
  // FE-3 canonical 金額格式化：千分位，避免大額紅利可讀性差
  return `+${bonus.toLocaleString('en-US')}`
}

/**
 * 課程格子的顯示值：正式報名數 + 待審核標記（2026-08-06）。
 *
 * 回傳兩段而非單一字串，讓 template 能把待審核渲染成另一種顏色——「12 (+3)」
 * 全黑會被誤讀成一個數字。
 *
 * 口徑：`count` 為 enrolled + promoted_pending（後端 courses），`pending` 為
 * pending_review（後端 pending_review_courses）。兩者刻意分離，**待審核不進
 * 任何比率**（身分未審核前計入會讓參與率虛高並誤發學期紅利）。
 *
 * 待審核 > 0 時即使報名數為 0 也印出 "0"：只留一個孤零零的「+3」，讀者無從
 * 判斷基數是 0 還是沒資料。
 */
export function buildCourseCell(
  count: number | undefined | null,
  pending: number | undefined | null,
): { count: string; pending: string } {
  const enrolled = count || 0
  const pendingCount = pending || 0
  if (enrolled <= 0 && pendingCount <= 0) return { count: '', pending: '' }
  return {
    count: String(enrolled),
    pending: pendingCount > 0 ? `+${pendingCount}` : '',
  }
}
