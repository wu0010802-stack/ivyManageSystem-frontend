import { describe, it, expect } from 'vitest'
import {
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
  CATEGORY_OPTIONS,
  categoryLabel,
} from '@/constants/signoff'

describe('constants/signoff', () => {
  it('PAYMENT_METHOD_OPTIONS 有 5 種收付方式', () => {
    expect(PAYMENT_METHOD_OPTIONS.map((o) => o.value)).toEqual([
      'cash', 'bank_transfer', 'check', 'linepay', 'other',
    ])
  })

  it('paymentMethodLabel 對應中文，未知值原樣回傳', () => {
    expect(paymentMethodLabel('cash')).toBe('現金')
    expect(paymentMethodLabel('bank_transfer')).toBe('銀行匯款')
    expect(paymentMethodLabel('check')).toBe('支票')
    expect(paymentMethodLabel('linepay')).toBe('LINE Pay')
    expect(paymentMethodLabel('other')).toBe('其他')
    expect(paymentMethodLabel('未知')).toBe('未知')
  })

  it('CATEGORY_OPTIONS 有 6 種雜項收款類別', () => {
    expect(CATEGORY_OPTIONS.map((o) => o.value)).toEqual([
      'rent', 'donation', 'subsidy', 'secondhand_sale', 'refund_recovery', 'other',
    ])
  })

  it('categoryLabel 對應中文，未知值原樣回傳', () => {
    expect(categoryLabel('donation')).toBe('捐款')
    expect(categoryLabel('unknown')).toBe('unknown')
  })
})
