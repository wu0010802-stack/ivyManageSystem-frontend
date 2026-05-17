import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import { getTodayHub } from '@/api/portalClassHub'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn() },
}))

describe('portalClassHub api', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('getTodayHub hits /portal/class-hub/today and unwraps res.data', async () => {
    const payload = { classroom_id: 7, students: [] }
    api.get.mockResolvedValue({ data: payload })
    const result = await getTodayHub()
    expect(api.get).toHaveBeenCalledWith('/portal/class-hub/today')
    expect(result).toEqual(payload)
  })
})
