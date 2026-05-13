import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import { searchPortal } from '@/api/portalSearch'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn() },
}))

describe('portalSearch', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('searchPortal hits /portal/search with q param', async () => {
    api.get.mockResolvedValue({ data: { students: [] } })
    await searchPortal('小明')
    expect(api.get).toHaveBeenCalledWith('/portal/search', { params: { q: '小明' } })
  })
})
