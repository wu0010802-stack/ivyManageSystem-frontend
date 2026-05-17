/**
 * tests/unit/api/punchCorrections.test.js
 *
 * 驗證 src/api/punchCorrections.js wrapper：HTTP method / URL / payload。
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

  it('getCorrections GET /punch-corrections with params', async () => {
    await mod.getCorrections({ status: 'pending' })
    expect(mockGet).toHaveBeenCalledWith('/punch-corrections', {
      params: { status: 'pending' },
    })
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
