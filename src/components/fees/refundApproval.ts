/**
 * 學費退費申請（FIN-F2 Maker–Checker）共用判斷。
 *
 * 累計退款達簽核門檻時，直接 POST /fees/records/{id}/refund 會被後端擋下：
 * - 有金流簽核權者：409 detail.code = REFUND_APPROVAL_REQUIRED
 * - 無金流簽核權者：403（require_finance_approve 的字串 detail，含「審批閾值」）
 * 兩者都應改走「送出退費申請 → 另一位簽核者核准」。
 */
import { errorDetailObject } from '@/utils/errorMessages'

export const REFUND_APPROVAL_REQUIRED = 'REFUND_APPROVAL_REQUIRED'
// 後端 require_finance_approve 的固定措辭；403 無結構化 code 時以此辨識門檻擋下
const THRESHOLD_403_MARKER = '審批閾值'

export function isRefundApprovalRequired(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { detail?: unknown } } } | null)?.response
  if (!res) return false
  if (res.status === 409) return errorDetailObject(err)?.code === REFUND_APPROVAL_REQUIRED
  if (res.status === 403) {
    const d = res.data?.detail
    return typeof d === 'string' && d.includes(THRESHOLD_403_MARKER)
  }
  return false
}

/** 後端擋下時給使用者看的說明（409 帶 message；403 為字串 detail）。 */
export function refundApprovalMessage(err: unknown): string {
  const obj = errorDetailObject<{ message?: unknown }>(err)
  if (obj && typeof obj.message === 'string') return obj.message
  const d = (err as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail
  return typeof d === 'string' ? d : '本次退費累計已達簽核門檻'
}

/**
 * 是否為目前登入者自己送出的申請。後端 FeeRefundRequestOut 只回 requested_by_name
 * （= 申請時的 username），故以 username 比對；比對不到時不判定為本人（後端仍會 403）。
 */
export function isOwnRefundRequest(
  requestedByName: string | null | undefined,
  currentUsername: unknown,
): boolean {
  return (
    typeof currentUsername === 'string'
    && currentUsername !== ''
    && !!requestedByName
    && requestedByName === currentUsername
  )
}
