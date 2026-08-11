/**
 * tests/unit/api/punchCorrections.test.js
 *
 * 驗證 src/api/punchCorrections.ts wrapper：HTTP method / URL / payload。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    put: mockPut,
  },
}))

import * as mod from '@/api/punchCorrections'

describe('punchCorrections api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPut.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
  })

  it('getCorrections 一律帶 page/page_size 並回正規化的 PagedResult', async () => {
    mockGet.mockResolvedValue({ data: { items: [{ id: 1 }], total: 1, page: 1, page_size: 5000 } })
    const res = await mod.getCorrections({ status: 'pending' })
    expect(mockGet).toHaveBeenCalledWith('/punch-corrections', {
      params: { status: 'pending', page: 1, page_size: 5000 },
    })
    expect(res.items).toEqual([{ id: 1 }])
    expect(res.total).toBe(1)
  })

  it('approveCorrection PUT /punch-corrections/:id/approve with approved=true', async () => {
    const payload = { approved: true }
    await mod.approveCorrection(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/punch-corrections/42/approve', payload)
  })

  it('approveCorrection PUT /punch-corrections/:id/approve with approved=false + reason', async () => {
    const payload = { approved: false, rejection_reason: '理由不足' }
    await mod.approveCorrection(99, payload)
    expect(mockPut).toHaveBeenCalledWith('/punch-corrections/99/approve', payload)
  })
})
