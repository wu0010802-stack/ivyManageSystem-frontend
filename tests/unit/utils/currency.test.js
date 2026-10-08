import { describe, it, expect } from 'vitest'
import { formatAmount, formatCurrency } from '@/utils/currency'

describe('formatCurrency()', () => {
  it('以 NT$ 前綴 + 千分位格式化（無空格）', () => {
    expect(formatCurrency(1234)).toBe('NT$1,234')
  })

  it('大數字千分位', () => {
    expect(formatCurrency(50000)).toBe('NT$50,000')
  })

  it('0 回傳 NT$0（不誤判 falsy）', () => {
    expect(formatCurrency(0)).toBe('NT$0')
  })

  it('字串數字也能格式化', () => {
    expect(formatCurrency('5000')).toBe('NT$5,000')
  })

  it('負數（退費）', () => {
    expect(formatCurrency(-500)).toBe('NT$-500')
  })

  it('null / undefined / 空字串 / 非數字 → 破折號 —', () => {
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency(undefined)).toBe('—')
    expect(formatCurrency('')).toBe('—')
    expect(formatCurrency('abc')).toBe('—')
  })
})

describe('formatAmount()（表格儲存格：無 NT$ 前綴）', () => {
  it('千分位、無前綴', () => {
    expect(formatAmount(13000)).toBe('13,000')
    expect(formatAmount('9680')).toBe('9,680')
  })

  it('0 與負數', () => {
    expect(formatAmount(0)).toBe('0')
    expect(formatAmount(-500)).toBe('-500')
  })

  it('null / undefined / 空字串 / 非數字 → 破折號 —（與 formatCurrency 同 fallback）', () => {
    expect(formatAmount(null)).toBe('—')
    expect(formatAmount(undefined)).toBe('—')
    expect(formatAmount('')).toBe('—')
    expect(formatAmount('abc')).toBe('—')
  })
})
