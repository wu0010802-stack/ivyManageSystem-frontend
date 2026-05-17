/**
 * tests/unit/api/notifications.test.js
 *
 * 驗證 src/api/notifications.js wrapper：目前只有彙總 endpoint。
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

import * as mod from '@/api/notifications'

describe('notifications api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
  })

  it('getNotificationSummary GET /notifications/summary', async () => {
    await mod.getNotificationSummary()
    expect(mockGet).toHaveBeenCalledWith('/notifications/summary')
  })
})
