/**
 * tests/unit/api/analytics.test.js
 *
 * 驗證 src/api/analytics.js wrapper：funnel / 流失預警 / 流失歷史。
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

import * as mod from '@/api/analytics'

describe('analytics api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
  })

  it('fetchFunnel GET /analytics/funnel with params passthrough', async () => {
    await mod.fetchFunnel({ from: '2025-01-01', to: '2025-12-31' })
    expect(mockGet).toHaveBeenCalledWith('/analytics/funnel', {
      params: { from: '2025-01-01', to: '2025-12-31' },
    })
  })

  it('fetchAtRisk GET /analytics/churn/at-risk without params', async () => {
    await mod.fetchAtRisk()
    expect(mockGet).toHaveBeenCalledWith('/analytics/churn/at-risk')
  })

  it('fetchChurnHistory GET /analytics/churn/history defaults months=12', async () => {
    await mod.fetchChurnHistory()
    expect(mockGet).toHaveBeenCalledWith('/analytics/churn/history', {
      params: { months: 12 },
    })
  })

  it('fetchChurnHistory GET /analytics/churn/history honors custom months', async () => {
    await mod.fetchChurnHistory(6)
    expect(mockGet).toHaveBeenCalledWith('/analytics/churn/history', {
      params: { months: 6 },
    })
  })
})
