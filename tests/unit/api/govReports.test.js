/**
 * tests/unit/api/govReports.test.js
 *
 * 驗證 src/api/govReports.ts wrapper：五個下載端點皆為 GET + blob。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: { get: mockGet },
}))

import * as mod from '@/api/govReports'

describe('govReports api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ data: new Blob() })
  })

  it('getStaffQualificationChecklist GET /gov-reports/staff-qualification-checklist with blob + params', async () => {
    await mod.getStaffQualificationChecklist({ year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/gov-reports/staff-qualification-checklist', {
      params: { year: 2026, month: 5 },
      responseType: 'blob',
    })
  })

  it('getLaborInsurance GET /gov-reports/labor-insurance with blob + params', async () => {
    await mod.getLaborInsurance({ year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/gov-reports/labor-insurance', {
      params: { year: 2026, month: 5 },
      responseType: 'blob',
    })
  })

  it('getHealthInsurance GET /gov-reports/health-insurance with blob + params', async () => {
    await mod.getHealthInsurance({ year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/gov-reports/health-insurance', {
      params: { year: 2026, month: 5 },
      responseType: 'blob',
    })
  })

  it('getWithholding GET /gov-reports/withholding with blob + params', async () => {
    await mod.getWithholding({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/gov-reports/withholding', {
      params: { year: 2026 },
      responseType: 'blob',
    })
  })

  it('getPension GET /gov-reports/pension with blob + params', async () => {
    await mod.getPension({ year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/gov-reports/pension', {
      params: { year: 2026, month: 5 },
      responseType: 'blob',
    })
  })
})
