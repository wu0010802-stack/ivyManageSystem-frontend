import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rejectableStages } from '../settlementReject'

describe('rejectableStages（退回按鈕權限矩陣，鏡射 BE _resolve_settlement_reject_permission）', () => {
  it('SUPERVISOR_SIGNED 需要 YEAR_END_REVIEW', () => {
    expect(rejectableStages['SUPERVISOR_SIGNED']).toBe('YEAR_END_REVIEW')
  })
  it('ACCOUNTING_SIGNED 需要 YEAR_END_ACCOUNTING', () => {
    expect(rejectableStages['ACCOUNTING_SIGNED']).toBe('YEAR_END_ACCOUNTING')
  })
  it('FINALIZED 需要 YEAR_END_FINALIZE', () => {
    expect(rejectableStages['FINALIZED']).toBe('YEAR_END_FINALIZE')
  })
  it('DRAFT 不可退回', () => {
    expect(rejectableStages['DRAFT']).toBeUndefined()
  })
})
