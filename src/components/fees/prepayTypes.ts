/**
 * 預繳款共用 view-model 型別與狀態標籤（2026-08-26 預繳併入帳款）。
 *
 * 供 FeeMonthlyStatement（預繳欄）、PrepaymentDrawer（額度管理抽屜）、
 * PrepaymentRefundsDialog（退款清單）三處共用；狀態機語意見 SPEC-014 §3.6–3.8。
 */

export interface PrepayCreditRow {
  id: number
  student_id: number | null
  student_name: string | null
  recruitment_visit_id: number | null
  visit_child_name: string | null
  target_school_year: number
  target_semester: number
  original_amount: number
  status: string
  balance: number
}

export interface PrepayRefundRow {
  id: number
  prepayment_credit_id: number
  amount: number
  status: string
  reason: string
  recipient_name: string | null
  disbursed_at: string | null
}

export interface PrepayMovementRow {
  id: number
  movement_type: string
  amount: number
  occurred_at: string
  reason: string | null
}

export const CREDIT_STATUS_LABELS: Record<string, string> = {
  available: '可用',
  applied: '已套用',
  refund_pending: '退款處理中',
  refunded: '已退款',
  reversed: '已沖銷',
}

export const REFUND_STATUS_LABELS: Record<string, string> = {
  requested: '待老闆核准',
  approved: '已核准（待領款）',
  completed: '已完成',
  cancelled: '已取消',
  reversed: '已沖銷',
}

export const MOVEMENT_LABELS: Record<string, string> = {
  received: '收到預繳',
  applied: '套用註冊費',
  refunded: '現金退款',
  reversed: '沖銷',
  transferred: '訪視轉正式學生',
}

type TagType = 'success' | 'info' | 'warning' | 'danger'

export function creditStatusTag(status: string): TagType {
  return (
    (
      {
        available: 'success',
        applied: 'info',
        refund_pending: 'warning',
        refunded: 'info',
        reversed: 'danger',
      } as const
    )[status] ?? 'info'
  )
}

export function refundStatusTag(status: string): TagType {
  return (
    (
      {
        requested: 'warning',
        approved: 'warning',
        completed: 'success',
        cancelled: 'info',
        reversed: 'danger',
      } as const
    )[status] ?? 'info'
  )
}
