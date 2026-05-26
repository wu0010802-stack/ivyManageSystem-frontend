/**
 * tests/api/leaveQuotaExpiry.test.ts
 *
 * 驗證 leaveQuotaExpiry.ts 4 個 wrapper：
 *   listUpcomingGrants / listUpcomingAnniversaries / listPayoutHistory / runSchedulerNow
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

import { listUpcomingGrants, listUpcomingAnniversaries, listPayoutHistory, runSchedulerNow } from '@/api/leaveQuotaExpiry'

describe('api/leaveQuotaExpiry endpoints', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
  })

  it('listUpcomingGrants calls /leave-quota-expiry/upcoming with days', async () => {
    mockGet.mockResolvedValueOnce({ data: { grants: [] } })
    await listUpcomingGrants(30)
    expect(mockGet).toHaveBeenCalledWith('/leave-quota-expiry/upcoming', { params: { days: 30 } })
  })

  it('listUpcomingAnniversaries calls /leave-quota-expiry/anniversaries with days', async () => {
    mockGet.mockResolvedValueOnce({ data: { anniversaries: [] } })
    await listUpcomingAnniversaries(30)
    expect(mockGet).toHaveBeenCalledWith('/leave-quota-expiry/anniversaries', { params: { days: 30 } })
  })

  it('listPayoutHistory calls /leave-quota-expiry/payout-history with limit', async () => {
    mockGet.mockResolvedValueOnce({ data: { logs: [] } })
    await listPayoutHistory(50)
    expect(mockGet).toHaveBeenCalledWith('/leave-quota-expiry/payout-history', { params: { limit: 50 } })
  })

  it('runSchedulerNow POSTs to /leave-quota-expiry/run-now', async () => {
    mockPost.mockResolvedValueOnce({ data: { comp_summary: {}, cutover_summary: {} } })
    await runSchedulerNow()
    expect(mockPost).toHaveBeenCalledWith('/leave-quota-expiry/run-now')
  })
})
