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

  it('payment_status=overpaid → 溢繳', () => {
    expect(paymentBadge({ payment_status: 'overpaid', is_paid: false }).label).toBe(
      '溢繳',
    )
  })

  it('無 payment_status 時向後相容：依 is_paid 兜底', () => {
    expect(paymentBadge({ is_paid: true }).label).toBe('已繳費')
    expect(paymentBadge({ is_paid: false }).label).toBe('未繳費')
  })
})
