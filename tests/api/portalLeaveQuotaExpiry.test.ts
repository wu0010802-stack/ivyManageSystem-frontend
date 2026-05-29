import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
  },
}))

import { getMyLeaveQuotaExpiry } from '@/api/portalLeaveQuotaExpiry'

describe('api/portalLeaveQuotaExpiry', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('getMyLeaveQuotaExpiry calls /portal/me/leave-quota-expiry', async () => {
    mockGet.mockResolvedValue({ data: { compensatory_balance: 0 } })
    await getMyLeaveQuotaExpiry()
    expect(mockGet).toHaveBeenCalledWith('/portal/me/leave-quota-expiry')
  })
})
