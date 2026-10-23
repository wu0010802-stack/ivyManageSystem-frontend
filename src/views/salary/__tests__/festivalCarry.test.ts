import { describe, it, expect } from 'vitest'
import {
  toBoolConfigValue,
  isValidYearMonth,
  validateManualEntry,
  signedAmountLabel,
  type ManualEntryDraft,
} from '../festivalCarry'

const draft = (over: Partial<ManualEntryDraft> = {}): ManualEntryDraft => ({
  entry_type: 'waive',
  amount: 1000,
  salary_year: 2026,
  salary_month: 12,
  note: '園長同意沖銷',
  ...over,
})

describe('toBoolConfigValue', () => {
  it('布林轉後端只接受的 "true"/"false" 字串', () => {
    expect(toBoolConfigValue(true)).toBe('true')
    expect(toBoolConfigValue(false)).toBe('false')
  })
})

describe('isValidYearMonth', () => {
  it('只接受 YYYY-MM', () => {
    expect(isValidYearMonth('2026-11')).toBe(true)
    expect(isValidYearMonth('2026-00')).toBe(false)
    expect(isValidYearMonth('2026-1')).toBe(false)
    expect(isValidYearMonth('')).toBe(false)
    expect(isValidYearMonth(null)).toBe(false)
  })
})

describe('validateManualEntry — 對齊後端 CarryManualEntryCreate（amount>0、不得超過餘額）', () => {
  it('合法草稿回 null', () => {
    expect(validateManualEntry(draft(), 3000)).toBeNull()
    expect(validateManualEntry(draft({ amount: 3000 }), 3000)).toBeNull()
  })
  it('超過餘額擋下', () => {
    expect(validateManualEntry(draft({ amount: 3001 }), 3000)).toContain('不得超過目前餘額')
  })
  it('金額為 0、負數、小數、空值擋下', () => {
    for (const amount of [0, -5, 10.5, null]) {
      expect(validateManualEntry(draft({ amount }), 3000)).toBe('金額須為大於 0 的整數')
    }
  })
  it('未選類型、未選年月、備註空白擋下', () => {
    expect(validateManualEntry(draft({ entry_type: '' }), 3000)).toBe('請選擇登記類型')
    expect(validateManualEntry(draft({ salary_month: null }), 3000)).toBe('請選擇歸屬薪資年月')
    expect(validateManualEntry(draft({ note: '   ' }), 3000)).toContain('請填寫備註')
  })
})

describe('signedAmountLabel', () => {
  it('正數加號、負數減號、千分位', () => {
    expect(signedAmountLabel(6000)).toBe('+6,000')
    expect(signedAmountLabel(-1500)).toBe('−1,500')
    expect(signedAmountLabel(0)).toBe('0')
  })
})
