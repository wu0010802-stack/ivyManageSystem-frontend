import { describe, it, expect } from 'vitest'
import { fmtPct } from '@/utils/format'

describe('fmtPct', () => {
  it('數值已是百分比 → 一位小數 + %', () => expect(fmtPct(83.62)).toBe('83.6%'))
  it('isRatio: 0–1 比值 ×100', () => expect(fmtPct(0.905, { isRatio: true })).toBe('90.5%'))
  it('digits 覆寫', () => expect(fmtPct(83.625, { digits: 2 })).toBe('83.63%'))
  it('null/undefined/NaN → em dash', () => {
    expect(fmtPct(null)).toBe('—'); expect(fmtPct(undefined)).toBe('—'); expect(fmtPct('abc')).toBe('—')
  })
})
