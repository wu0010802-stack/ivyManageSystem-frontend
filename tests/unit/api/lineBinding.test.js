import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  getMyLineBinding,
  updateMyLineBinding,
  deleteMyLineBinding,
} from '@/api/lineBinding'

vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('lineBinding api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.put.mockReset()
    api.delete.mockReset()
  })

  it('getMyLineBinding hits /portal/profile/line-binding', async () => {
    api.get.mockResolvedValue({ data: {} })
    await getMyLineBinding()
    expect(api.get).toHaveBeenCalledWith('/portal/profile/line-binding')
  })

  it('updateMyLineBinding puts payload to /portal/profile/line-binding', async () => {
    api.put.mockResolvedValue({ data: {} })
    const payload = { line_user_id: 'U123', display_name: 'Foo' }
    await updateMyLineBinding(payload)
    expect(api.put).toHaveBeenCalledWith('/portal/profile/line-binding', payload)
  })

  it('deleteMyLineBinding deletes /portal/profile/line-binding', async () => {
    api.delete.mockResolvedValue({ data: {} })
    await deleteMyLineBinding()
    expect(api.delete).toHaveBeenCalledWith('/portal/profile/line-binding')
  })
})
