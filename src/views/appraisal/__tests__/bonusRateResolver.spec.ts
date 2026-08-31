import { describe, it, expect } from 'vitest'
import { resolveBonusRate, NO_BONUS_GRADES } from '../bonusRateResolver'

describe('resolveBonusRate', () => {
  const rates = [
    { id: 1, effective_from: '2024-08-01', role_group: 'HOMEROOM', grade: 'OUTSTANDING', base_amount: '5000' },
    { id: 2, effective_from: '2025-08-01', role_group: 'HOMEROOM', grade: 'OUTSTANDING', base_amount: '6000' },
    { id: 3, effective_from: '2025-08-01', role_group: 'HOMEROOM', grade: 'GOOD', base_amount: '3000' },
  ]

  it('取 effective_from ≤ onDate 中最新的一筆', () => {
    const match = resolveBonusRate(rates, 'HOMEROOM', 'OUTSTANDING', '2025-09-15')
    expect(match).toEqual({ baseAmount: 6000, effectiveFrom: '2025-08-01' })
  })

  it('onDate 早於所有 effective_from 時回傳 null', () => {
    const match = resolveBonusRate(rates, 'HOMEROOM', 'OUTSTANDING', '2024-01-01')
    expect(match).toBeNull()
  })

  it('role_group／grade 不符時回傳 null', () => {
    expect(resolveBonusRate(rates, 'SUPERVISOR', 'OUTSTANDING', '2025-09-15')).toBeNull()
  })

  it('base_amount 為 0 或非數字時回傳 null', () => {
    const zeroRates = [{ id: 4, effective_from: '2024-08-01', role_group: 'STAFF', grade: 'PASS', base_amount: '0' }]
    expect(resolveBonusRate(zeroRates, 'STAFF', 'PASS', '2025-01-01')).toBeNull()
  })

  it('NO_BONUS_GRADES 涵蓋 PASS/WARN/FAIL', () => {
    expect(NO_BONUS_GRADES.has('PASS')).toBe(true)
    expect(NO_BONUS_GRADES.has('WARN')).toBe(true)
    expect(NO_BONUS_GRADES.has('FAIL')).toBe(true)
    expect(NO_BONUS_GRADES.has('OUTSTANDING')).toBe(false)
  })
})
