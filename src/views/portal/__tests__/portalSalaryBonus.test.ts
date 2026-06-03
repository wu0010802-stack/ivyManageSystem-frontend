import { describe, it, expect } from 'vitest'
import { computeIndependentBonusNet } from '../portalSalaryBonus'

describe('computeIndependentBonusNet — 不可雙重扣減會議缺席扣款', () => {
  it('發放月含會議缺席：淨額 = festival + overtime（festival 已是淨額，不再減 meeting_absence）', () => {
    // festival_bonus=4000 是後端「已扣除 meeting_absence_deduction(1000) 之後」存下的值。
    // 回歸前的 bug 會再減一次 → 5000；正解為 6000。
    const salary = {
      festival_bonus: 4000,
      overtime_bonus: 2000,
      meeting_absence_deduction: 1000,
    }
    expect(computeIndependentBonusNet(salary)).toBe(6000)
    expect(computeIndependentBonusNet(salary)).not.toBe(5000)
  })

  it('一般月（無會議缺席）：淨額 = festival + overtime', () => {
    expect(
      computeIndependentBonusNet({
        festival_bonus: 3000,
        overtime_bonus: 0,
        meeting_absence_deduction: 0,
      }),
    ).toBe(3000)
  })

  it('缺欄位 / null 安全', () => {
    expect(computeIndependentBonusNet(null)).toBe(0)
    expect(computeIndependentBonusNet(undefined)).toBe(0)
    expect(computeIndependentBonusNet({})).toBe(0)
    expect(computeIndependentBonusNet({ festival_bonus: 500 })).toBe(500)
  })
})
