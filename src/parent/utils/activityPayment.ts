/**
 * 家長端才藝報名「繳費口徑」純函式。
 *
 * 後端（_registration_summary）已直接回傳 total_amount / outstanding_amount /
 * payment_status，與後台 / 公開端 _derive_payment_status 同口徑。前端一律以後端
 * 欄位為準渲染，不再自行加總課程（避免漏扣已繳、誤計候補課程、漏算用品）。
 */

export interface RegPaymentLike {
  is_paid?: boolean
  payment_status?: string
  outstanding_amount?: number
}

/** 待繳總額：各報名 outstanding_amount（= max(total-paid, 0)）之和。 */
export function sumOutstanding(regs: RegPaymentLike[]): number {
  return (regs || []).reduce((sum, r) => sum + Number(r?.outstanding_amount ?? 0), 0)
}

export type PaymentTone = 'ok' | 'warn' | 'neutral'

export interface PaymentBadge {
  label: string
  tone: PaymentTone
}

/**
 * 依後端 payment_status 映射顯示用 badge。
 * 無 payment_status（舊 response / 尚未升級的後端）時，向後相容退回 is_paid。
 */
export function paymentBadge(reg: RegPaymentLike): PaymentBadge {
  switch (reg.payment_status) {
    case 'paid':
      return { label: '已繳費', tone: 'ok' }
    case 'no_fee':
      return { label: '免繳', tone: 'neutral' }
    case 'partial':
      return { label: '部分繳費', tone: 'warn' }
    case 'overpaid':
      return { label: '溢繳', tone: 'warn' }
    case 'unpaid':
      return { label: '未繳費', tone: 'warn' }
    default:
      return reg.is_paid
        ? { label: '已繳費', tone: 'ok' }
        : { label: '未繳費', tone: 'warn' }
  }
}
