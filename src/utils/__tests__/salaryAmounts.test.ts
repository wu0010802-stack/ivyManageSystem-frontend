import { describe, expect, it } from 'vitest'
import {
  computeBaseTransferAmount,
  computeTotalTakeHomeAmount,
} from '../salaryAmounts'

describe('salaryAmounts', () => {
  it('主薪轉 = 薪資淨額 + 未休假折現', () => {
    expect(
      computeBaseTransferAmount({
        net_pay: 30000,
        net_salary: 99999,
        unused_leave_payout: 5000,
      }),
    ).toBe(35000)
  })

  it('沒有 net_pay 時改讀 records/portal 的 net_salary', () => {
    expect(
      computeBaseTransferAmount({
        net_salary: 13750,
        unused_leave_payout: 2250,
      }),
    ).toBe(16000)
  })

  it('最終到手 = 主薪轉 + 節慶獎金 + 超額獎金', () => {
    expect(
      computeTotalTakeHomeAmount({
        net_salary: 30000,
        unused_leave_payout: 5000,
        festival_bonus: 8000,
        overtime_bonus: 2000,
      }),
    ).toBe(45000)
  })
})
