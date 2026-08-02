import { describe, it, expect } from 'vitest'
import { sumOutstanding, paymentBadge } from '@/parent/utils/activityPayment'

describe('sumOutstanding', () => {
  it('以後端 outstanding_amount 加總，不前端自算課程', () => {
    // ④ 待繳總額應為各報名 outstanding_amount 之和（= max(total-paid,0)）。
    const regs = [
      { outstanding_amount: 2300 },
      { outstanding_amount: 0 }, // 已繳清 / 免繳 / 溢繳
      { outstanding_amount: 500 },
    ]
    expect(sumOutstanding(regs)).toBe(2800)
  })

  it('outstanding_amount 缺失時視為 0（不爆、不誤計）', () => {
    expect(sumOutstanding([{}, { outstanding_amount: 100 }])).toBe(100)
  })

  it('全候補（no_fee）不計入待繳', () => {
    // 候補課程後端不計入 total，outstanding=0 → 不應被當成待繳
    const regs = [{ payment_status: 'no_fee', outstanding_amount: 0 }]
    expect(sumOutstanding(regs)).toBe(0)
  })
})

describe('paymentBadge', () => {
  it('payment_status=no_fee → 免繳（非未繳費）', () => {
    expect(paymentBadge({ payment_status: 'no_fee', is_paid: false })).toEqual({
      label: '免繳',
      tone: 'neutral',
    })
  })

  it('payment_status=partial → 部分繳費', () => {
    expect(paymentBadge({ payment_status: 'partial', is_paid: false }).label).toBe(
      '部分繳費',
    )
  })

  it('payment_status=paid → 已繳費', () => {
    expect(paymentBadge({ payment_status: 'paid', is_paid: true }).label).toBe('已繳費')
  })

  it('payment_status=unpaid → 未繳費', () => {
    expect(paymentBadge({ payment_status: 'unpaid', is_paid: false }).label).toBe(
      '未繳費',
    )
  })

  it('payment_status=overpaid → 超繳（與 admin PAYMENT_STATUS_LABEL 對齊，消除「溢繳」漂移）', () => {
    const badge = paymentBadge({ payment_status: 'overpaid', is_paid: false })
    expect(badge.label).toBe('超繳')
    // tone 各自保留：overpaid 仍走 warn 渲染
    expect(badge.tone).toBe('warn')
  })

  it('label 一律取自 constants/activity 的 PAYMENT_STATUS_LABEL（單一來源）', async () => {
    const { PAYMENT_STATUS_LABEL } = await import('@/constants/activity')
    expect(paymentBadge({ payment_status: 'paid' }).label).toBe(PAYMENT_STATUS_LABEL.paid)
    expect(paymentBadge({ payment_status: 'no_fee' }).label).toBe(PAYMENT_STATUS_LABEL.no_fee)
    expect(paymentBadge({ payment_status: 'partial' }).label).toBe(PAYMENT_STATUS_LABEL.partial)
    expect(paymentBadge({ payment_status: 'unpaid' }).label).toBe(PAYMENT_STATUS_LABEL.unpaid)
  })

  it('無 payment_status 時向後相容：依 is_paid 兜底', () => {
    expect(paymentBadge({ is_paid: true }).label).toBe('已繳費')
    expect(paymentBadge({ is_paid: false }).label).toBe('未繳費')
  })
})

describe('paymentBadge — 待審核報名（比對不符）', () => {
  // 後端口徑：pending_review 課程不計入 total_amount（_build_public_query_payload），
  // 純待審核報名 payment_status 會落成 no_fee；直接渲染「免繳」會誤導家長以為不用錢。
  it('no_fee ＋ 全課程待審核 → 費用待審核（info），不顯示免繳', () => {
    const badge = paymentBadge({
      payment_status: 'no_fee',
      is_paid: false,
      courses: [{ status: 'pending_review' }],
    })
    expect(badge).toEqual({ label: '費用待審核', tone: 'info' })
  })

  it('pending_review_waitlist 同樣視為費用待審核', () => {
    const badge = paymentBadge({
      payment_status: 'no_fee',
      courses: [{ status: 'pending_review_waitlist' }],
    })
    expect(badge.label).toBe('費用待審核')
  })

  it('no_fee 但已有 enrolled 課（0 元課）→ 維持免繳', () => {
    const badge = paymentBadge({
      payment_status: 'no_fee',
      courses: [{ status: 'enrolled' }, { status: 'pending_review' }],
    })
    expect(badge.label).toBe('免繳')
  })

  it('有應繳（如用品費 unpaid）時不覆蓋 → 仍顯示未繳費', () => {
    const badge = paymentBadge({
      payment_status: 'unpaid',
      courses: [{ status: 'pending_review' }],
    })
    expect(badge.label).toBe('未繳費')
  })

  it('純候補（waitlist）不受影響 → 免繳', () => {
    const badge = paymentBadge({
      payment_status: 'no_fee',
      courses: [{ status: 'waitlist' }],
    })
    expect(badge.label).toBe('免繳')
  })

  it('courses 缺失（舊 response）→ 不覆蓋，維持原 badge', () => {
    expect(paymentBadge({ payment_status: 'no_fee' }).label).toBe('免繳')
  })
})
