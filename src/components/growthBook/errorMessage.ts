import { apiError } from '@/utils/error'

/**
 * 後端對「同學年已有成長冊」回 409，detail 形如
 * 「同學年已有成長冊（report_id=99, status=ready）」——內含資料表代碼與英文狀態，
 * 行政人員看不懂也無從處理，改成白話並指出下一步。
 */
const EXISTING_BOOK_PATTERN = '同學年已有成長冊'

export const EXISTING_BOOK_MESSAGE =
  '這位幼生本學年已有成長冊（或正在生成中），請重新整理確認目前狀態'

/** 是否為「該生本學年已有成長冊」的衝突錯誤（409）。 */
export function isExistingBookConflict(error: unknown): boolean {
  const e = error as { response?: { status?: number; data?: { detail?: unknown } } } | null
  if (e?.response?.status !== 409) return false
  const detail = e.response?.data?.detail
  return typeof detail === 'string' && detail.includes(EXISTING_BOOK_PATTERN)
}

/** 成長冊相關操作失敗時給使用者看的訊息：衝突改白話，其餘沿用後端 detail。 */
export function growthBookErrorMessage(error: unknown, fallback: string): string {
  if (isExistingBookConflict(error)) return EXISTING_BOOK_MESSAGE
  return apiError(error, fallback)
}
