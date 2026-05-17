import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import { getLineConfig, updateLineConfig, testLineNotify } from '@/api/lineConfig'

vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}))

describe('lineConfig api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.put.mockReset()
    api.post.mockReset()
  })

  it('getLineConfig hits /config/line', async () => {
    api.get.mockResolvedValue({ data: {} })
    await getLineConfig()
    expect(api.get).toHaveBeenCalledWith('/config/line')
  })

  it('updateLineConfig puts payload to /config/line', async () => {
    api.put.mockResolvedValue({ data: {} })
    const payload = { channel_access_token: 'xxx', channel_secret: 'yyy' }
    await updateLineConfig(payload)
    expect(api.put).toHaveBeenCalledWith('/config/line', payload)
  })

  it('testLineNotify posts to /config/line/test', async () => {
    api.post.mockResolvedValue({ data: { ok: true } })
    await testLineNotify()
    expect(api.post).toHaveBeenCalledWith('/config/line/test')
  })
})
