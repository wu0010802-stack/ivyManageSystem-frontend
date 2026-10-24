/**
 * SPEC-019 API wrapper：路徑、方法、payload 形狀（axios 以 mock 攔截）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const axiosMocks = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: {} })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  put: vi.fn(() => Promise.resolve({ data: {} })),
  patch: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
}))
vi.mock('@/api/index', () => ({ default: axiosMocks }))

import * as fees from '@/api/fees'

describe('SPEC-019 fees api wrappers', () => {
  beforeEach(() => {
    Object.values(axiosMocks).forEach((m) => m.mockClear())
  })

  it('importBillSlipBatch 帶 batch_kind form 欄', async () => {
    const file = new File(['x'], 'Check.xls')
    await fees.importBillSlipBatch(file, { title: '8月月費', batch_kind: 'registration' })
    const [url, form] = axiosMocks.post.mock.calls[0] as [string, FormData]
    expect(url).toBe('/fees/bill-slip-batches')
    expect(form.get('batch_kind')).toBe('registration')
    expect(form.get('title')).toBe('8月月費')
  })

  it('patchBillSlipBatch / assignBillSlipItemStudent', async () => {
    await fees.patchBillSlipBatch(7, { batch_kind: 'monthly' })
    expect(axiosMocks.patch).toHaveBeenCalledWith('/fees/bill-slip-batches/7', {
      batch_kind: 'monthly',
    })
    await fees.assignBillSlipItemStudent(7, 33, { student_id: 5 })
    expect(axiosMocks.put).toHaveBeenCalledWith(
      '/fees/bill-slip-batches/7/items/33/student',
      { student_id: 5 },
    )
  })

  it('cash-fee-batches 六支', async () => {
    await fees.previewCashFeeBatch({
      kind: 'material', school_year: 115, semester: 1, amounts_by_grade: { 1: 2500 },
    })
    expect(axiosMocks.post).toHaveBeenLastCalledWith(
      '/fees/cash-fee-batches/preview',
      expect.objectContaining({ kind: 'material' }),
    )
    await fees.createCashFeeBatch({
      kind: 'material', title: '教材費', school_year: 115, semester: 1,
      entries: [{ student_id: 1, amount: 2500 }],
    })
    expect(axiosMocks.post).toHaveBeenLastCalledWith(
      '/fees/cash-fee-batches',
      expect.objectContaining({ title: '教材費' }),
    )
    await fees.addCashFeeBatchEntries(3, { entries: [{ student_id: 2, amount: 2500 }] })
    expect(axiosMocks.post).toHaveBeenLastCalledWith(
      '/fees/cash-fee-batches/3/entries',
      expect.objectContaining({ entries: [{ student_id: 2, amount: 2500 }] }),
    )
    await fees.getCashFeeBatches({ school_year: 115, semester: 1 })
    expect(axiosMocks.get).toHaveBeenLastCalledWith('/fees/cash-fee-batches', {
      params: { school_year: 115, semester: 1 },
    })
    await fees.getCashFeeBatch(3)
    expect(axiosMocks.get).toHaveBeenLastCalledWith('/fees/cash-fee-batches/3')
    await fees.deleteCashFeeBatch(3)
    expect(axiosMocks.delete).toHaveBeenLastCalledWith('/fees/cash-fee-batches/3')
  })

  it('範本／銷帳碼／產單 wrapper 已不存在', () => {
    const removed = [
      'getFeeTemplates', 'createFeeTemplate', 'updateFeeTemplate', 'deleteFeeTemplate',
      'copyYearFeeTemplates', 'generateFeeRecords', 'getBillingCodes',
      'suggestBillingCodes', 'activateBillingCodes', 'deactivateBillingCode',
    ]
    for (const name of removed) {
      expect((fees as Record<string, unknown>)[name]).toBeUndefined()
    }
  })
})
