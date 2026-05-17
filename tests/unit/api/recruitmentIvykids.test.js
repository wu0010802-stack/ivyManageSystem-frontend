/**
 * tests/unit/api/recruitmentIvykids.test.js
 *
 * 驗證 src/api/recruitmentIvykids.js wrapper：HTTP method / URL / payload。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  },
}))

import * as mod from '@/api/recruitmentIvykids'

describe('recruitmentIvykids api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('getRecruitmentIvykidsBackendStatus GET /recruitment/ivykids/status', async () => {
    await mod.getRecruitmentIvykidsBackendStatus()
    expect(mockGet).toHaveBeenCalledWith('/recruitment/ivykids/status')
  })

  it('syncRecruitmentIvykidsBackend POST /recruitment/ivykids/sync', async () => {
    const payload = { token: 'xyz' }
    await mod.syncRecruitmentIvykidsBackend(payload)
    expect(mockPost).toHaveBeenCalledWith('/recruitment/ivykids/sync', payload)
  })

  it('deleteRecruitmentIvykidsBackendRecords DELETE /recruitment/ivykids/records', async () => {
    await mod.deleteRecruitmentIvykidsBackendRecords()
    expect(mockDelete).toHaveBeenCalledWith('/recruitment/ivykids/records')
  })

  it('getRecruitmentIvykidsStats GET /recruitment/ivykids/stats', async () => {
    await mod.getRecruitmentIvykidsStats()
    expect(mockGet).toHaveBeenCalledWith('/recruitment/ivykids/stats')
  })

  it('getRecruitmentIvykidsRecords GET /recruitment/ivykids/records with params', async () => {
    await mod.getRecruitmentIvykidsRecords({ status: 'pending' })
    expect(mockGet).toHaveBeenCalledWith('/recruitment/ivykids/records', {
      params: { status: 'pending' },
    })
  })
})
