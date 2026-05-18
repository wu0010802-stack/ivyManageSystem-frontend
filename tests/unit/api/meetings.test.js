/**
 * tests/unit/api/meetings.test.js
 *
 * 驗證 src/api/meetings.ts wrapper：HTTP method / URL / payload 對齊。
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

import * as mod from '@/api/meetings'

describe('meetings api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('getMeetings GET /meetings with params', async () => {
    await mod.getMeetings({ month: '2026-05' })
    expect(mockGet).toHaveBeenCalledWith('/meetings', { params: { month: '2026-05' } })
  })

  it('getMeetingSummary GET /meetings/summary with params', async () => {
    await mod.getMeetingSummary({ month: '2026-05' })
    expect(mockGet).toHaveBeenCalledWith('/meetings/summary', { params: { month: '2026-05' } })
  })

  it('createBatch POST /meetings/batch', async () => {
    const payload = { date: '2026-05-17', employee_ids: [42, 99] }
    await mod.createBatch(payload)
    expect(mockPost).toHaveBeenCalledWith('/meetings/batch', payload)
  })

  it('updateMeeting PUT /meetings/:id', async () => {
    const payload = { hours: 2 }
    await mod.updateMeeting(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/meetings/42', payload)
  })

  it('deleteMeeting DELETE /meetings/:id', async () => {
    await mod.deleteMeeting(42)
    expect(mockDelete).toHaveBeenCalledWith('/meetings/42')
  })
})
