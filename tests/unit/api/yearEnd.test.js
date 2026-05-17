/**
 * tests/unit/api/yearEnd.test.js
 *
 * 驗證 src/api/yearEnd.js wrapper：HTTP method / URL / payload / multipart + params /
 * URL builder（exportYearEndSummaryXlsxUrl / exportYearEndTransferRosterXlsxUrl）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, defaults } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  defaults: { baseURL: '/api' },
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    defaults,
  },
}))

import * as mod from '@/api/yearEnd'

describe('yearEnd api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
  })

  it('listYearEndCycles GET /year_end/cycles', async () => {
    await mod.listYearEndCycles()
    expect(mockGet).toHaveBeenCalledWith('/year_end/cycles')
  })

  it('createYearEndCycle POST /year_end/cycles', async () => {
    const payload = { year: 2026 }
    await mod.createYearEndCycle(payload)
    expect(mockPost).toHaveBeenCalledWith('/year_end/cycles', payload)
  })

  it('listOrgYearSettings GET /year_end/cycles/:cycleId/org_settings', async () => {
    await mod.listOrgYearSettings(42)
    expect(mockGet).toHaveBeenCalledWith('/year_end/cycles/42/org_settings')
  })

  it('upsertOrgYearSettings POST /year_end/cycles/:cycleId/org_settings', async () => {
    const payload = { rate: 0.9 }
    await mod.upsertOrgYearSettings(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/year_end/cycles/42/org_settings', payload)
  })

  it('listClassEnrollmentTargets GET /year_end/cycles/:cycleId/class_targets', async () => {
    await mod.listClassEnrollmentTargets(42)
    expect(mockGet).toHaveBeenCalledWith('/year_end/cycles/42/class_targets')
  })

  it('listYearEndSettlements GET /year_end/cycles/:cycleId/settlements', async () => {
    await mod.listYearEndSettlements(42)
    expect(mockGet).toHaveBeenCalledWith('/year_end/cycles/42/settlements')
  })

  it('signSupervisorSettlement POST /year_end/settlements/:settlementId/sign_supervisor', async () => {
    await mod.signSupervisorSettlement(99)
    expect(mockPost).toHaveBeenCalledWith('/year_end/settlements/99/sign_supervisor')
  })

  it('signAccountingSettlement POST /year_end/settlements/:settlementId/sign_accounting', async () => {
    await mod.signAccountingSettlement(99)
    expect(mockPost).toHaveBeenCalledWith('/year_end/settlements/99/sign_accounting')
  })

  it('finalizeSettlement POST /year_end/settlements/:settlementId/finalize', async () => {
    await mod.finalizeSettlement(99)
    expect(mockPost).toHaveBeenCalledWith('/year_end/settlements/99/finalize')
  })

  it('listSpecialBonuses GET /year_end/cycles/:cycleId/special_bonuses with params', async () => {
    await mod.listSpecialBonuses(42, { type: 'extra' })
    expect(mockGet).toHaveBeenCalledWith('/year_end/cycles/42/special_bonuses', {
      params: { type: 'extra' },
    })
  })

  it('listSpecialBonuses GET with default empty params', async () => {
    await mod.listSpecialBonuses(42)
    expect(mockGet).toHaveBeenCalledWith('/year_end/cycles/42/special_bonuses', {
      params: {},
    })
  })

  it('addSpecialBonus POST /year_end/cycles/:cycleId/special_bonuses', async () => {
    const payload = { employee_id: 7, amount: 1000 }
    await mod.addSpecialBonus(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/year_end/cycles/42/special_bonuses', payload)
  })

  it('importYearEndExcel POST /year_end/cycles/import_excel with multipart + mapped params (defaults)', async () => {
    const file = new Blob(['x'], { type: 'text/plain' })
    await mod.importYearEndExcel(file, {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      bonusCalcDate: '2026-12-15',
    })
    expect(mockPost).toHaveBeenCalledTimes(1)
    const [url, fd, opts] = mockPost.mock.calls[0]
    expect(url).toBe('/year_end/cycles/import_excel')
    expect(fd).toBeInstanceOf(FormData)
    // 注意：FormData.append(Blob) 會包成 File，因此這裡只驗 entry 存在
    expect(fd.get('file')).toBeTruthy()
    expect(opts).toEqual({
      params: {
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        bonus_calc_date: '2026-12-15',
        org_achievement_rate_first: 83.6,
        org_achievement_rate_second: 91.5,
        enrollment_target: 160,
      },
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('importYearEndExcel POST with custom rates and target', async () => {
    const file = new Blob(['x'])
    await mod.importYearEndExcel(file, {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      bonusCalcDate: '2026-12-15',
      orgRateFirst: 90,
      orgRateSecond: 95,
      enrollmentTarget: 200,
    })
    const [, , opts] = mockPost.mock.calls[0]
    expect(opts.params.org_achievement_rate_first).toBe(90)
    expect(opts.params.org_achievement_rate_second).toBe(95)
    expect(opts.params.enrollment_target).toBe(200)
  })

  it('exportYearEndSummaryXlsxUrl returns URL with baseURL', () => {
    expect(mod.exportYearEndSummaryXlsxUrl(42)).toBe('/api/year_end/cycles/42/summary.xlsx')
  })

  it('exportYearEndTransferRosterXlsxUrl returns URL with baseURL', () => {
    expect(mod.exportYearEndTransferRosterXlsxUrl(42)).toBe('/api/year_end/cycles/42/transfer_roster.xlsx')
  })
})
