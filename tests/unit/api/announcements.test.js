/**
 * tests/unit/api/announcements.test.js
 *
 * 薄殼測試：驗證 src/api/announcements.js 每個 exported function 把參數正確
 * 轉發到 axios wrapper（method/URL/params/body 形狀）。
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

import * as mod from '@/api/announcements'

describe('announcements api', () => {
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

  it('getAnnouncements GET /announcements with params', async () => {
    const params = { audience: 'all', limit: 20 }
    await mod.getAnnouncements(params)
    expect(mockGet).toHaveBeenCalledWith('/announcements', { params })
  })

  it('createAnnouncement POST /announcements with body', async () => {
    const payload = { title: '公告', content: 'hello', audience: 'all' }
    await mod.createAnnouncement(payload)
    expect(mockPost).toHaveBeenCalledWith('/announcements', payload)
  })

  it('updateAnnouncement PUT /announcements/:id', async () => {
    await mod.updateAnnouncement(42, { title: '改' })
    expect(mockPut).toHaveBeenCalledWith('/announcements/42', { title: '改' })
  })

  it('deleteAnnouncement DELETE /announcements/:id', async () => {
    await mod.deleteAnnouncement(42)
    expect(mockDelete).toHaveBeenCalledWith('/announcements/42')
  })

  it('getAnnouncementParentRecipients GET /announcements/:id/parent-recipients', async () => {
    await mod.getAnnouncementParentRecipients(42)
    expect(mockGet).toHaveBeenCalledWith('/announcements/42/parent-recipients')
  })

  it('replaceAnnouncementParentRecipients PUT /announcements/:id/parent-recipients wraps recipients', async () => {
    const recipients = [
      { scope: 'classroom', classroom_id: 7 },
      { scope: 'student', student_id: 99 },
    ]
    await mod.replaceAnnouncementParentRecipients(42, recipients)
    expect(mockPut).toHaveBeenCalledWith(
      '/announcements/42/parent-recipients',
      { recipients }
    )
  })
})
