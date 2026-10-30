import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  // C15：後端回應已帶權威值（services/salary/amounts.py::base_transfer_amount，例如
  // 快照列表 SalarySnapshotSummaryOut）時直接用，不在前端重算。
  it('回應已帶 base_transfer_amount 時以後端值為準', () => {
    expect(
      computeBaseTransferAmount({
        net_salary: 30000,
        unused_leave_payout: 5000,
        base_transfer_amount: 34999,
      }),
    ).toBe(34999)
  })

  it('base_transfer_amount 為 0 也照用（是後端值，不是缺欄位）', () => {
    expect(
      computeBaseTransferAmount({ net_salary: 30000, base_transfer_amount: 0 }),
    ).toBe(0)
  })

  it('base_transfer_amount 為 null 時退回前端公式', () => {
    expect(
      computeBaseTransferAmount({
        net_salary: 30000,
        unused_leave_payout: 5000,
        base_transfer_amount: null,
      }),
    ).toBe(35000)
  })

  it('最終到手沿用後端主薪轉值再加節慶與超額獎金', () => {
    expect(
      computeTotalTakeHomeAmount({
        net_salary: 30000,
        unused_leave_payout: 5000,
        base_transfer_amount: 34999,
        festival_bonus: 1,
        overtime_bonus: 0,
      }),
    ).toBe(35000)
  })

  // 薪資列表（SalaryRecordItemOut）與快照明細（SalarySnapshotDetailOut）原本沒有這個欄位，
  // 前端只能自己重算；後端補上後由產生型別釘住，欄位被拿掉時這裡先紅，
  // 不會悄悄退回前端公式。
  it.each(['SalaryRecordItemOut', 'SalarySnapshotDetailOut', 'SalarySnapshotSummaryOut'])(
    'schema.d.ts 的 %s 宣告 base_transfer_amount',
    (name) => {
      const schema = readFileSync(
        resolve(__dirname, '../../api/_generated/schema.d.ts'),
        'utf-8',
      )
      const start = schema.indexOf(`        ${name}: {`)
      expect(start, `${name} 不在 schema.d.ts`).toBeGreaterThan(-1)
      const end = schema.indexOf('\n        };', start)
      expect(schema.slice(start, end)).toMatch(/\bbase_transfer_amount\??: number;/)
    },
  )
})
