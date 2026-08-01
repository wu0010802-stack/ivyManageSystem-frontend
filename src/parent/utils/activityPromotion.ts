/**
 * 候補轉正（promoted_pending）的期限判定 —— 元件與 view 共用單一事實來源。
 *
 * 2026-07-31 盲區稽核 C4/C3：清單元件要用它決定「還能不能按確認」，才藝頁要用它
 * 統計「其他孩子還有幾筆待確認」。兩處若各寫一份，逾期口徑遲早分叉。
 */

export interface PromotionCourseLike {
  status: string
  confirm_deadline?: string | null
}

/**
 * 確認期限是否已過。沒有 confirm_deadline（或格式不可解析）時一律回 false，
 * 維持「後端沒給期限就照常可確認」的既有行為，不做悲觀假設。
 */
export function isPromotionExpired(course: PromotionCourseLike): boolean {
  if (!course.confirm_deadline) return false
  const t = new Date(course.confirm_deadline).getTime()
  return Number.isFinite(t) && t < Date.now()
}

/** 這門課是否為「還在期限內、等家長確認」的候補轉正。 */
export function isActionablePromotion(course: PromotionCourseLike): boolean {
  return course.status === 'promoted_pending' && !isPromotionExpired(course)
}
