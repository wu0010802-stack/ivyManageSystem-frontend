/**
 * 請假核准遇到「與其他已核准假單時間重疊」的錯誤判讀與白話化。
 *
 * 後端契約（api/leaves.py `ApproveRequest`）：
 * - 單筆核准遇重疊且未帶 `force_overlap` → 409，detail 為字串，結尾帶參數名：
 *   「該員工在 A ~ B 已有另一筆已核准的請假（ID: 12），若確認仍要核准請帶 force_overlap=true 並填寫 force_overlap_reason」
 * - 帶 `force_overlap: true` 需 `force_overlap_reason` ≥10 字，操作者需具 ACTIVITY_PAYMENT_APPROVE，否則 403
 *   （detail 同樣含參數名）。
 * - 批次核准遇重疊一律拒絕，逐筆失敗原因寫「…請改用單筆核准並帶 force_overlap」。
 *
 * 這些訊息是寫給 API 呼叫者的，行政人員看到 `force_overlap=true` 無從處理。這裡集中負責：
 * 辨識是不是這類錯誤、把後端文字改成白話。檢查一律看「狀態碼＋訊息含參數名」，
 * 其他 409／403 完全不受影響。
 */
import { apiError } from '@/utils/error'

/** 後端 `ApproveRequest._force_overlap_requires_reason`：原因至少 10 字。 */
export const FORCE_OVERLAP_REASON_MIN_LENGTH = 10
/** 後端 `force_overlap_reason` 的 `max_length`。 */
export const FORCE_OVERLAP_REASON_MAX_LENGTH = 500

/** 重送被後端以 403 拒絕時（前端權限判斷與後端不一致）顯示的白話訊息。 */
export const FORCE_OVERLAP_FORBIDDEN_MESSAGE = '強制核准需具備「金流簽核」權限，請改由具該權限者處理'

const PARAM = 'force_overlap'

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status

/** 後端回的訊息文字（interceptor 的 displayMessage 優先，其次 detail 字串）。 */
const messageOf = (error: unknown): string => apiError(error, '')

/** 核准被擋：409，且訊息要求帶 `force_overlap`（＝與已核准假單時間重疊）。 */
export function isLeaveOverlapConflict(error: unknown): boolean {
  return statusOf(error) === 409 && messageOf(error).includes(PARAM)
}

/** 帶了 `force_overlap` 卻被 403 拒絕（後端要求金流簽核權限）。 */
export function isForceOverlapForbidden(error: unknown): boolean {
  return statusOf(error) === 403 && messageOf(error).includes(PARAM)
}

/**
 * 把含 `force_overlap` 的後端訊息改成白話：
 * - 批次核准的「請改用單筆核准並帶 force_overlap」→「請改用單筆核准並確認強制核准」
 * - 單筆 409 結尾的「，若確認仍要核准請帶 force_overlap=true 並填寫 force_overlap_reason」整句拿掉，只留衝突描述
 * 不含參數名的訊息原樣回傳。
 */
export function friendlyForceOverlapText(text: string): string {
  if (!text?.includes(PARAM)) return text
  let out = text.replace(/並帶\s*force_overlap(?:\s*=\s*true)?/gi, '並確認強制核准')
  if (out.includes(PARAM)) {
    out = out.replace(/[，,；;]?[^，,；;。]*force_overlap[^，,；;。]*/gi, '').trim()
  }
  return out.replace(/（ID:\s*(\d+)）/g, '（假單 #$1）')
}

/** 對話框顯示用的衝突描述（不含參數名）；後端沒給可用文字時退回通用說明。 */
export function leaveOverlapConflictText(error: unknown): string {
  return friendlyForceOverlapText(messageOf(error)) || '此假單與該員工已核准的假單時間重疊'
}

/** 原因字數：去掉前後空白後以字元計（對齊後端 Python `len`，emoji 不會被算成兩字）。 */
export function forceOverlapReasonLength(reason: string): number {
  return Array.from(reason.trim()).length
}
