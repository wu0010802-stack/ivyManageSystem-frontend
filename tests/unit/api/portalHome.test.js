import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import { getHomeSummary } from '@/api/portalHome'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn() },
}))

describe('portalHome api', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('getHomeSummary hits /portal/home/summary', async () => {
    api.get.mockResolvedValue({ data: { today: {} } })
    await getHomeSummary()
    expect(api.get).toHaveBeenCalledWith('/portal/home/summary')
  })
})
