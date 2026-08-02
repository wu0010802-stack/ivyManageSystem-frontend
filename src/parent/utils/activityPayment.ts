/**
 * 家長端才藝報名「繳費口徑」純函式。
 *
 * 後端（_registration_summary）已直接回傳 total_amount / outstanding_amount /
 * payment_status，與後台 / 公開端 _derive_payment_status 同口徑。前端一律以後端
 * 欄位為準渲染，不再自行加總課程（避免漏扣已繳、誤計候補課程、漏算用品）。
 */

import { PAYMENT_STATUS_LABEL } from '@/constants/activity'

export interface RegPaymentLike {
  is_paid?: boolean
  payment_status?: string
  outstanding_amount?: number
  courses?: { status?: string }[]
}

/** 待繳總額：各報名 outstanding_amount（= max(total-paid, 0)）之和。 */
export function sumOutstanding(regs: RegPaymentLike[]): number {
  return (regs || []).reduce((sum, r) => sum + Number(r?.outstanding_amount ?? 0), 0)
}

export type PaymentTone = 'ok' | 'warn' | 'neutral' | 'info'

/**
 * 「費用待審核」badge label（前端衍生狀態，非後端 payment_status 值域）。
 *
 * 後端對 pending_review 課程不計價（_build_public_query_payload 只加總 enrolled），
 * 純待審核報名的 payment_status 會落成 no_fee；此時渲染「免繳」會誤導家長以為
 * 確定不用錢，故覆蓋為此 label，與公開查詢頁「未計費／審核後更新」口徑一致。
 */
export const PENDING_REVIEW_FEE_LABEL = '費用待審核'

/** 報名的課程費用是否仍待校方審核：有 pending_review* 課且無任何已計費（enrolled）課。 */
function isFeePendingReview(reg: RegPaymentLike): boolean {
  const courses = reg.courses || []
  return (
    courses.some((c) => (c.status || '').startsWith('pending_review')) &&
    !courses.some((c) => c.status === 'enrolled')
  )
}

export interface PaymentBadge {
  label: string
  tone: PaymentTone
}

/**
 * 依後端 payment_status 映射顯示用 badge。
 * label 取自 constants/activity 的 PAYMENT_STATUS_LABEL（與 admin 單一來源，
 * 消除 parent「溢繳」漂移→統一「超繳」）；tone 各自保留（家長端不同渲染系統）。
 * 無 payment_status（舊 response / 尚未升級的後端）時，向後相容退回 is_paid。
 */
const _LABELS = PAYMENT_STATUS_LABEL as Record<string, string>

export function paymentBadge(reg: RegPaymentLike): PaymentBadge {
  switch (reg.payment_status) {
    case 'paid':
      return { label: _LABELS.paid, tone: 'ok' }
    case 'no_fee':
      if (isFeePendingReview(reg)) return { label: PENDING_REVIEW_FEE_LABEL, tone: 'info' }
      return { label: _LABELS.no_fee, tone: 'neutral' }
    case 'partial':
      return { label: _LABELS.partial, tone: 'warn' }
    case 'overpaid':
      return { label: _LABELS.overpaid, tone: 'warn' }
    case 'unpaid':
      return { label: _LABELS.unpaid, tone: 'warn' }
    default:
      return reg.is_paid
        ? { label: _LABELS.paid, tone: 'ok' }
        : { label: _LABELS.unpaid, tone: 'warn' }
  }
}
