/**
 * tests/unit/api/fees.test.js
 *
 * 薄殼測試：涵蓋 src/api/fees.ts 的端點。
 * templates 端點已於 SPEC-019 移除（費用範本退場），原 tests/api/fees-templates.spec.js
 * 一併刪除，此處不再有對應涵蓋。
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

import * as mod from '@/api/fees'

describe('fees api — non-template endpoints', () => {
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

  it('getFeePeriods GET /fees/periods', async () => {
    await mod.getFeePeriods()
    expect(mockGet).toHaveBeenCalledWith('/fees/periods')
  })

  it('getFeeRecords GET /fees/records with params', async () => {
    const params = { school_year: 114, semester: 1, status: 'unpaid' }
    await mod.getFeeRecords(params)
    expect(mockGet).toHaveBeenCalledWith('/fees/records', { params })
  })

  it('payFeeRecord PUT /fees/records/:id/pay with payload', async () => {
    const payload = { paid_amount: 1000, payment_date: '2026-05-17' }
    await mod.payFeeRecord(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/fees/records/42/pay', payload)
  })

  it('refundFeeRecord POST /fees/records/:id/refund with payload', async () => {
    const payload = { amount: 500, reason: '退費' }
    await mod.refundFeeRecord(42, payload)
    expect(mockPost).toHaveBeenCalledWith('/fees/records/42/refund', payload)
  })

  it('suggestRefund POST /fees/records/:id/refund-suggest with payload', async () => {
    const payload = { effective_date: '2026-05-01' }
    await mod.suggestRefund(42, payload)
    expect(mockPost).toHaveBeenCalledWith(
      '/fees/records/42/refund-suggest',
      payload
    )
  })

  it('getFeeRefunds GET /fees/records/:id/refunds', async () => {
    await mod.getFeeRefunds(42)
    expect(mockGet).toHaveBeenCalledWith('/fees/records/42/refunds')
  })

  it('getFeeSummary GET /fees/summary with params', async () => {
    const params = { school_year: 114, semester: 1 }
    await mod.getFeeSummary(params)
    expect(mockGet).toHaveBeenCalledWith('/fees/summary', { params })
  })

})
