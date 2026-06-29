import { describe, it, expect } from 'vitest'
import { CATEGORY_OPTIONS, categoryLabel, paymentMethodLabel } from '../miscReceipt'

describe('miscReceipt api helpers', () => {
  it('exposes 6 categories', () => {
    expect(CATEGORY_OPTIONS.map((o) => o.value)).toEqual([
      'rent',
      'donation',
      'subsidy',
      'secondhand_sale',
      'refund_recovery',
      'other',
    ])
  })

  it('maps category value to label', () => {
    expect(categoryLabel('donation')).toBe('捐款')
    expect(categoryLabel('unknown')).toBe('unknown')
  })

  it('maps payment method to label', () => {
    expect(paymentMethodLabel('linepay')).toBe('LINE Pay')
  })
})
