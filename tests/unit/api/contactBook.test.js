/**
 * tests/unit/api/contactBook.test.js
 *
 * 驗證 src/api/contactBook.js wrapper。
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

import * as mod from '@/api/contactBook'

describe('contactBook api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockPatch.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('getClassDay GET /portal/contact-book with params', async () => {
    await mod.getClassDay({ classroom_id: 1, date: '2026-05-17' })
    expect(mockGet).toHaveBeenCalledWith('/portal/contact-book', {
      params: { classroom_id: 1, date: '2026-05-17' },
    })
  })

  it('batchUpsert POST /portal/contact-book/batch', async () => {
    const payload = { classroom_id: 1, date: '2026-05-17', entries: [] }
    await mod.batchUpsert(payload)
    expect(mockPost).toHaveBeenCalledWith('/portal/contact-book/batch', payload)
  })

  it('updateEntry PUT /portal/contact-book/:id 帶 If-Match header when version 提供', async () => {
    const payload = { mood: 'happy' }
    await mod.updateEntry(42, payload, 3)
    expect(mockPut).toHaveBeenCalledWith('/portal/contact-book/42', payload, {
      headers: { 'If-Match': '3' },
    })
  })

  it('updateEntry version=null 時 headers 為空物件', async () => {
    await mod.updateEntry(42, { mood: 'ok' }, null)
    expect(mockPut).toHaveBeenCalledWith('/portal/contact-book/42', { mood: 'ok' }, {
      headers: {},
    })
  })

  it('publishEntry POST /portal/contact-book/:id/publish', async () => {
    await mod.publishEntry(42)
    expect(mockPost).toHaveBeenCalledWith('/portal/contact-book/42/publish')
  })

  it('uploadPhoto POST /portal/contact-book/:id/photos with multipart header', async () => {
    const fd = new FormData()
    fd.append('file', new File(['x'], 'a.jpg'))
    await mod.uploadPhoto(42, fd)
    expect(mockPost).toHaveBeenCalledWith('/portal/contact-book/42/photos', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('deletePhoto DELETE /portal/contact-book/:id/photos/:attachmentId', async () => {
    await mod.deletePhoto(42, 99)
    expect(mockDelete).toHaveBeenCalledWith('/portal/contact-book/42/photos/99')
  })

  it('listUnpublished GET /portal/contact-book/unpublished with params', async () => {
    await mod.listUnpublished({ classroom_id: 1, date: '2026-05-17' })
    expect(mockGet).toHaveBeenCalledWith('/portal/contact-book/unpublished', {
      params: { classroom_id: 1, date: '2026-05-17' },
    })
  })

  it('copyFromYesterday POST /portal/contact-book/copy-from-yesterday', async () => {
    const payload = { classroom_id: 1, target_date: '2026-05-17' }
    await mod.copyFromYesterday(payload)
    expect(mockPost).toHaveBeenCalledWith('/portal/contact-book/copy-from-yesterday', payload)
  })

  it('applyTemplate POST /portal/contact-book/apply-template', async () => {
    const payload = { template_id: 7, entry_ids: [1, 2] }
    await mod.applyTemplate(payload)
    expect(mockPost).toHaveBeenCalledWith('/portal/contact-book/apply-template', payload)
  })

  it('batchPublish POST /portal/contact-book/batch-publish', async () => {
    const payload = { entry_ids: [1, 2, 3] }
    await mod.batchPublish(payload)
    expect(mockPost).toHaveBeenCalledWith('/portal/contact-book/batch-publish', payload)
  })
})
