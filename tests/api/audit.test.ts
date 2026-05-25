/**
 * tests/api/audit.test.ts
 *
 * 驗證 audit.ts 新增的 3 個高風險 audit wrapper：
 *   getHighRiskAudits / ackAudit / ackAllAudits
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
  },
}))

import { getHighRiskAudits, ackAudit, ackAllAudits } from '@/api/audit'

describe('api/audit high-risk endpoints', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
  })

  it('getHighRiskAudits calls /audit-logs/high-risk with params', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], unack_count: 0, total: 0 } })
    await getHighRiskAudits({ days: 7, unack_only: true, limit: 50 })
    expect(mockGet).toHaveBeenCalledWith('/audit-logs/high-risk', {
      params: { days: 7, unack_only: true, limit: 50 },
    })
  })

  it('ackAudit calls POST /audit-logs/{id}/ack', async () => {
    mockPost.mockResolvedValueOnce({ data: { ok: true } })
    await ackAudit(42)
    expect(mockPost).toHaveBeenCalledWith('/audit-logs/42/ack')
  })

  it('ackAllAudits calls POST /audit-logs/ack-all', async () => {
    mockPost.mockResolvedValueOnce({ data: { acknowledged_count: 5 } })
    await ackAllAudits({ days: 7 })
    expect(mockPost).toHaveBeenCalledWith('/audit-logs/ack-all', null, {
      params: { days: 7 },
    })
  })
})
