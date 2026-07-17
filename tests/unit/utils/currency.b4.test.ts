import { describe, it, expect } from 'vitest'
import { formatCurrency } from '@/utils/currency'

// C4-Intl-formatters（batch4）：formatCurrency 改用 module 級 Intl.NumberFormat 單例，
// 輸出必須與改前 Number(val).toLocaleString('zh-Hant') 完全一致（hardcode 預期字串鎖定行為）。
describe('formatCurrency() — Intl 單例 behavior-preserving', () => {
  it('對樣本值輸出與 toLocaleString 版本逐字一致', () => {
    const cases: Array<[unknown, string]> = [
      [0, 'NT$0'],
      // 負零：兩種實作皆輸出 'NT$-0'（行為保持，非本次改動引入）
      [-0, 'NT$-0'],
      [1234, 'NT$1,234'],
      [50000, 'NT$50,000'],
      [-500, 'NT$-500'],
      [-5678.9, 'NT$-5,678.9'],
      [1234567.891, 'NT$1,234,567.891'],
      [0.5, 'NT$0.5'],
      [-0.001, 'NT$-0.001'],
      [999999999.99, 'NT$999,999,999.99'],
      ['5000', 'NT$5,000'],
    ]
    for (const [input, expected] of cases) {
      expect(formatCurrency(input)).toBe(expected)
    }
  })

  it('空值 / 非數字仍回破折號 —', () => {
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency(undefined)).toBe('—')
    expect(formatCurrency('')).toBe('—')
    expect(formatCurrency('abc')).toBe('—')
  })

  it('與現行 toLocaleString 實作交叉比對（隨機不同量級皆等價）', () => {
    for (const v of [0, 7, 89, 100, 12345, -42, -9876.54, 3.14159, 1e15]) {
      expect(formatCurrency(v)).toBe('NT$' + Number(v).toLocaleString('zh-Hant'))
    }
  })
})
