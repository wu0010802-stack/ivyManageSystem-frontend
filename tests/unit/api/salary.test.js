/**
 * tests/unit/api/salary.test.js
 *
 * 驗證 src/api/salary.ts wrapper：HTTP method / URL / payload / 特殊 header / responseType。
 * 不驗薪資邏輯（不算金額），只驗參數轉發。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}))

import * as mod from '@/api/salary'

describe('salary api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('calculate 預設帶 use_snapshot=true', async () => {
    await mod.calculate(2026, 5)
    expect(mockPost).toHaveBeenCalledWith(
      '/salaries/calculate?year=2026&month=5&use_snapshot=true',
    )
  })

  it('getFestivalBonus GET /salaries/festival-bonus?year=&month=', async () => {
    await mod.getFestivalBonus(2026, 5)
    expect(mockGet).toHaveBeenCalledWith('/salaries/festival-bonus?year=2026&month=5')
  })

  it('getFestivalBonusPeriodAccrual GET /salaries/festival-bonus/period-accrual?year=&month=', async () => {
    await mod.getFestivalBonusPeriodAccrual(2026, 5)
    expect(mockGet).toHaveBeenCalledWith(
      '/salaries/festival-bonus/period-accrual?year=2026&month=5',
    )
  })

  it('getRecords GET /salaries/records?year=&month=', async () => {
    await mod.getRecords(2026, 5)
    expect(mockGet).toHaveBeenCalledWith('/salaries/records?year=2026&month=5')
  })

  it('getSalaryBreakdown GET /salaries/:recordId/breakdown', async () => {
    await mod.getSalaryBreakdown(42)
    expect(mockGet).toHaveBeenCalledWith('/salaries/42/breakdown')
  })

  it('getSalaryFieldBreakdown GET /salaries/:recordId/field-breakdown?field=', async () => {
    await mod.getSalaryFieldBreakdown(42, 'base')
    expect(mockGet).toHaveBeenCalledWith('/salaries/42/field-breakdown?field=base')
  })

  it('manualAdjustSalary PUT /salaries/:recordId/manual-adjust without version', async () => {
    const payload = { base: 30000, reason: 'fix' }
    await mod.manualAdjustSalary(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/salaries/42/manual-adjust', payload, {})
  })

  it('manualAdjustSalary PUT /salaries/:recordId/manual-adjust with If-Match header', async () => {
    const payload = { base: 30000 }
    await mod.manualAdjustSalary(42, payload, 3)
    expect(mockPut).toHaveBeenCalledWith('/salaries/42/manual-adjust', payload, {
      headers: { 'If-Match': '"3"' },
    })
  })

  it('getHistory GET /salaries/history with params', async () => {
    await mod.getHistory({ employee_id: 42 })
    expect(mockGet).toHaveBeenCalledWith('/salaries/history', { params: { employee_id: 42 } })
  })

  it('exportTransferRoster GET /salaries/:year/:month/transfer-roster as blob', async () => {
    await mod.exportTransferRoster(2026, 5, 'base')
    expect(mockGet).toHaveBeenCalledWith('/salaries/2026/5/transfer-roster', {
      params: { type: 'base' },
      responseType: 'blob',
    })
  })

  it('simulateSalary POST /salaries/simulate', async () => {
    const payload = { employee_id: 42, year: 2026, month: 5 }
    await mod.simulateSalary(payload)
    expect(mockPost).toHaveBeenCalledWith('/salaries/simulate', payload)
  })

  it('getSalaryLogic GET /salaries/logic', async () => {
    await mod.getSalaryLogic()
    expect(mockGet).toHaveBeenCalledWith('/salaries/logic')
  })

  it('getEmployeeSalaryDebug GET /salaries/employee-salary-debug with params', async () => {
    await mod.getEmployeeSalaryDebug({ employee_id: 42, year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/salaries/employee-salary-debug', {
      params: { employee_id: 42, year: 2026, month: 5 },
    })
  })

  it('listSalarySnapshots GET /salaries/snapshots without employeeId', async () => {
    await mod.listSalarySnapshots(2026, 5)
    expect(mockGet).toHaveBeenCalledWith('/salaries/snapshots', {
      params: { year: 2026, month: 5 },
    })
  })

  it('listSalarySnapshots GET /salaries/snapshots with employeeId', async () => {
    await mod.listSalarySnapshots(2026, 5, 42)
    expect(mockGet).toHaveBeenCalledWith('/salaries/snapshots', {
      params: { year: 2026, month: 5, employee_id: 42 },
    })
  })

  it('getSalarySnapshot GET /salaries/snapshots/:id', async () => {
    await mod.getSalarySnapshot(99)
    expect(mockGet).toHaveBeenCalledWith('/salaries/snapshots/99')
  })

  it('createManualSnapshot POST /salaries/snapshots?year=&month= with default payload', async () => {
    await mod.createManualSnapshot(2026, 5)
    expect(mockPost).toHaveBeenCalledWith('/salaries/snapshots?year=2026&month=5', {})
  })

  it('createManualSnapshot POST /salaries/snapshots?year=&month= with payload', async () => {
    await mod.createManualSnapshot(2026, 5, { note: 'x' })
    expect(mockPost).toHaveBeenCalledWith('/salaries/snapshots?year=2026&month=5', { note: 'x' })
  })

  it('getSnapshotDiff GET /salaries/snapshots/:id/diff', async () => {
    await mod.getSnapshotDiff(99)
    expect(mockGet).toHaveBeenCalledWith('/salaries/snapshots/99/diff')
  })

  it('unfinalizeSalary DELETE /salaries/:recordId/finalize with reason body', async () => {
    await mod.unfinalizeSalary(42, '更正錯帳因應審計')
    expect(mockDelete).toHaveBeenCalledWith('/salaries/42/finalize', {
      data: { reason: '更正錯帳因應審計' },
    })
  })
})
