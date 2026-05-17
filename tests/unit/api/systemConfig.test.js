/**
 * tests/unit/api/systemConfig.test.js
 *
 * 驗證 src/api/systemConfig.js wrapper。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut, mockDelete, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
  mockPatch: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
    patch: mockPatch,
  },
}))

import * as mod from '@/api/systemConfig'

describe('systemConfig api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockPatch.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
  })

  it('listSystemConfigs GET /system-configs 無 prefix 時 params 為空物件', async () => {
    await mod.listSystemConfigs()
    expect(mockGet).toHaveBeenCalledWith('/system-configs', { params: {} })
  })

  it('listSystemConfigs GET /system-configs 帶 prefix', async () => {
    await mod.listSystemConfigs('payment.')
    expect(mockGet).toHaveBeenCalledWith('/system-configs', {
      params: { prefix: 'payment.' },
    })
  })

  it('listSystemConfigs 空字串 prefix 視為 falsy 不帶 key', async () => {
    await mod.listSystemConfigs('')
    expect(mockGet).toHaveBeenCalledWith('/system-configs', { params: {} })
  })

  it('getSystemConfig GET /system-configs/:key with URI encoding', async () => {
    await mod.getSystemConfig('payment.account')
    expect(mockGet).toHaveBeenCalledWith('/system-configs/payment.account')
  })

  it('getSystemConfig key 含特殊字元時做 encodeURIComponent', async () => {
    await mod.getSystemConfig('a/b c')
    expect(mockGet).toHaveBeenCalledWith('/system-configs/a%2Fb%20c')
  })

  it('updateSystemConfig PUT /system-configs/:key with payload', async () => {
    const payload = { value: '某銀行 123-456' }
    await mod.updateSystemConfig('payment.account', payload)
    expect(mockPut).toHaveBeenCalledWith('/system-configs/payment.account', payload)
  })

  it('updateSystemConfig key 做 encodeURIComponent', async () => {
    await mod.updateSystemConfig('a/b', { value: 'x' })
    expect(mockPut).toHaveBeenCalledWith('/system-configs/a%2Fb', { value: 'x' })
  })
})
