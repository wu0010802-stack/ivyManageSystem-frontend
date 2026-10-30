import { describe, it, expect } from 'vitest'
import { LEAVE_TYPES, LEAVE_RULE_HINTS, MATERNITY_FULL_PAY_SENIORITY_MONTHS } from '../leaves'

// 後端 services/leave_quota_calc.py：產假、流產假到職滿 6 個月不扣，未滿 6 個月減半
// （MATERNITY_FULL_PAY_SENIORITY_MONTHS=6、MATERNITY_UNDER_SENIORITY_RATIO=0.5）。
// 前端說明文字原寫「不扣」，會讓未滿 6 個月的同仁誤以為全薪。
describe('產假／流產假扣薪說明與後端年資規則一致', () => {
  it('年資門檻常數與後端相同（6 個月）', () => {
    expect(MATERNITY_FULL_PAY_SENIORITY_MONTHS).toBe(6)
  })

  for (const value of ['maternity', 'miscarriage']) {
    it(`${value} 的扣薪說明寫出未滿 6 個月減半`, () => {
      const t = LEAVE_TYPES.find((x) => x.value === value)
      expect(t?.deduction).toContain('6 個月')
      expect(t?.deduction).toContain('減半')
      const hint = (LEAVE_RULE_HINTS as Record<string, string>)[value]
      expect(hint).toContain('6 個月')
      expect(hint).toContain('減半')
    })
  }
})
