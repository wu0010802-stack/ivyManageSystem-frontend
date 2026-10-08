/**
 * 管理端「調查管理」列表的純函式模型（可測，不依賴 Vue）。
 *
 * 後端 `GET /surveys` 只回 draft／published／closed 三態，且不會在截止日後自動翻成
 * closed（`services/surveys/lifecycle.is_open` 以 `reply_deadline >= today` 判定）。
 * 列表要讓行政一眼看出「還在收回覆」與「已截止但還沒結束」的差別，因此在前端
 * 推導出第四個顯示狀態 `expired`，並以此決定排序、計數與可用操作。
 */

export interface SurveyListRow {
  id: number
  title: string
  event_date: string | null
  reply_deadline: string
  audience_type: string
  status: string
  replied_count: number
  denominator: number
}

/** 顯示用狀態：草稿／進行中／已截止（published 但過了截止日）／已結束 */
export type SurveyDisplayStatus = 'draft' | 'open' | 'expired' | 'closed'

export const SURVEY_STATUS_LABELS: Record<SurveyDisplayStatus, string> = {
  draft: '草稿',
  open: '進行中',
  expired: '已截止',
  closed: '已結束',
}

export type SurveyTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

export const SURVEY_STATUS_TAG: Record<SurveyDisplayStatus, SurveyTagType> = {
  draft: 'info',
  open: 'success',
  expired: 'warning',
  closed: 'info',
}

/** 篩選段落的固定順序（與排序優先級一致：先看還在收的，再看該收尾的）。 */
export const SURVEY_STATUS_ORDER: SurveyDisplayStatus[] = ['open', 'expired', 'draft', 'closed']

export function deriveSurveyStatus(
  row: Pick<SurveyListRow, 'status' | 'reply_deadline'>,
  today: string,
): SurveyDisplayStatus {
  if (row.status === 'draft') return 'draft'
  if (row.status === 'closed') return 'closed'
  if (row.status === 'published') return row.reply_deadline >= today ? 'open' : 'expired'
  // 未知狀態一律當已結束處理，避免誤放出「發布／結束」等動作。
  return 'closed'
}

/** 兩個 YYYY-MM-DD 之間的整數天數（target - today），以 UTC 計算避免 DST 漂移。 */
export function daysBetween(today: string, target: string): number {
  const a = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))
  const b = Date.UTC(Number(target.slice(0, 4)), Number(target.slice(5, 7)) - 1, Number(target.slice(8, 10)))
  return Math.round((b - a) / 86400000)
}

/**
 * 截止日的相對提示。進行中：「剩 N 天」／「今天截止」；已截止：「已過 N 天」；
 * 草稿與已結束不需要倒數，回空字串。
 */
export function deadlineHint(row: Pick<SurveyListRow, 'status' | 'reply_deadline'>, today: string): string {
  const status = deriveSurveyStatus(row, today)
  if (status === 'draft' || status === 'closed') return ''
  const days = daysBetween(today, row.reply_deadline)
  if (days === 0) return '今天截止'
  if (days > 0) return `剩 ${days} 天`
  return `已過 ${-days} 天`
}

/** 回覆率整數百分比；分母為 0 時回 0（避免 NaN 進畫面）。 */
export function replyPercent(row: Pick<SurveyListRow, 'replied_count' | 'denominator'>): number {
  if (!row.denominator) return 0
  return Math.round((row.replied_count / row.denominator) * 100)
}

/**
 * 列表排序：進行中（截止日近的在前）→ 已截止（最近截止的在前）→ 草稿（新的在前）
 * → 已結束（新的在前）。後端固定 id desc，這裡只改畫面順序。
 */
export function sortSurveyRows<T extends SurveyListRow>(rows: T[], today: string): T[] {
  const rank = (s: SurveyDisplayStatus) => SURVEY_STATUS_ORDER.indexOf(s)
  return [...rows].sort((a, b) => {
    const sa = deriveSurveyStatus(a, today)
    const sb = deriveSurveyStatus(b, today)
    if (sa !== sb) return rank(sa) - rank(sb)
    if (sa === 'open') {
      if (a.reply_deadline !== b.reply_deadline) return a.reply_deadline < b.reply_deadline ? -1 : 1
      return b.id - a.id
    }
    if (sa === 'expired') {
      if (a.reply_deadline !== b.reply_deadline) return a.reply_deadline > b.reply_deadline ? -1 : 1
      return b.id - a.id
    }
    return b.id - a.id
  })
}

export function countByStatus(rows: SurveyListRow[], today: string): Record<SurveyDisplayStatus, number> {
  const counts: Record<SurveyDisplayStatus, number> = { draft: 0, open: 0, expired: 0, closed: 0 }
  for (const row of rows) counts[deriveSurveyStatus(row, today)] += 1
  return counts
}

export interface SurveyListFilter {
  search?: string
  status?: SurveyDisplayStatus | ''
}

export function filterSurveyRows<T extends SurveyListRow>(rows: T[], filter: SurveyListFilter, today: string): T[] {
  const q = (filter.search ?? '').trim().toLowerCase()
  return rows.filter((row) => {
    if (filter.status && deriveSurveyStatus(row, today) !== filter.status) return false
    if (q && !row.title.toLowerCase().includes(q)) return false
    return true
  })
}
