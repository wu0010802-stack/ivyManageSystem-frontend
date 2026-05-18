/**
 * tests/unit/api/reports.test.js
 *
 * 驗證 src/api/reports.ts wrapper。注意 financeSummaryExportUrl 是純字串組合，
 * 不打 http，只驗 query string 與 month 省略條件。
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

import * as mod from '@/api/reports'

describe('reports api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
  })

  it('getDashboard GET /reports/dashboard with params passthrough', async () => {
    await mod.getDashboard({ year: 114, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/reports/dashboard', {
      params: { year: 114, month: 5 },
    })
  })

  it('getFinanceSummary GET /reports/finance-summary with year only when month is undefined', async () => {
    await mod.getFinanceSummary(114)
    expect(mockGet).toHaveBeenCalledWith('/reports/finance-summary', {
      params: { year: 114 },
    })
  })

  it('getFinanceSummary GET /reports/finance-summary skips month when null', async () => {
    await mod.getFinanceSummary(114, null)
    expect(mockGet).toHaveBeenCalledWith('/reports/finance-summary', {
      params: { year: 114 },
    })
  })

  it('getFinanceSummary GET /reports/finance-summary includes month when provided', async () => {
    await mod.getFinanceSummary(114, 5)
    expect(mockGet).toHaveBeenCalledWith('/reports/finance-summary', {
      params: { year: 114, month: 5 },
    })
  })

  it('getFinanceSummaryDetail GET /reports/finance-summary/detail with year + month', async () => {
    await mod.getFinanceSummaryDetail(114, 5)
    expect(mockGet).toHaveBeenCalledWith('/reports/finance-summary/detail', {
      params: { year: 114, month: 5 },
    })
  })

  it('financeSummaryExportUrl returns export path with year only when month is null', () => {
    expect(mod.financeSummaryExportUrl(114)).toBe(
      '/reports/finance-summary/export?year=114'
    )
    expect(mod.financeSummaryExportUrl(114, null)).toBe(
      '/reports/finance-summary/export?year=114'
    )
  })

  it('financeSummaryExportUrl returns export path with both year + month', () => {
    expect(mod.financeSummaryExportUrl(114, 5)).toBe(
      '/reports/finance-summary/export?year=114&month=5'
    )
  })

  it('getAttendanceDetail GET /reports/attendance/detail with year only by default', async () => {
    await mod.getAttendanceDetail(114)
    expect(mockGet).toHaveBeenCalledWith('/reports/attendance/detail', {
      params: { year: 114 },
    })
  })

  it('getAttendanceDetail includes month when provided', async () => {
    await mod.getAttendanceDetail(114, { month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/reports/attendance/detail', {
      params: { year: 114, month: 5 },
    })
  })

  it('getAttendanceDetail includes classroom_id when provided', async () => {
    await mod.getAttendanceDetail(114, { classroomId: 7 })
    expect(mockGet).toHaveBeenCalledWith('/reports/attendance/detail', {
      params: { year: 114, classroom_id: 7 },
    })
  })

  it('getAttendanceDetail includes both month + classroom_id when provided', async () => {
    await mod.getAttendanceDetail(114, { month: 5, classroomId: 7 })
    expect(mockGet).toHaveBeenCalledWith('/reports/attendance/detail', {
      params: { year: 114, month: 5, classroom_id: 7 },
    })
  })

  it('getSalaryContributors GET /reports/salary/contributors', async () => {
    await mod.getSalaryContributors(114, 5)
    expect(mockGet).toHaveBeenCalledWith('/reports/salary/contributors', {
      params: { year: 114, month: 5 },
    })
  })

  it('getMonthlyPnL GET /reports/monthly-pnl with year param and unwraps .data', async () => {
    const payload = { year: 2026, sections: [], totals: {}, pending_items: [] }
    mockGet.mockResolvedValueOnce({ data: payload })
    const result = await mod.getMonthlyPnL(2026)
    expect(mockGet).toHaveBeenCalledWith('/reports/monthly-pnl', {
      params: { year: 2026 },
    })
    // 與其他 wrapper 不同：getMonthlyPnL 直接 .then(r => r.data)，不回 axios envelope
    expect(result).toBe(payload)
  })
})
