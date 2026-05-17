/**
 * tests/unit/api/contactBookTemplates.test.js
 *
 * 驗證 src/api/contactBookTemplates.js wrapper。
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

import * as mod from '@/api/contactBookTemplates'

describe('contactBookTemplates api', () => {
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
    mockPatch.mockResolvedValue({ data: {} })
  })

  it('listTemplates GET /portal/contact-book/templates 預設無 params', async () => {
    await mod.listTemplates()
    expect(mockGet).toHaveBeenCalledWith('/portal/contact-book/templates', { params: {} })
  })

  it('listTemplates GET /portal/contact-book/templates with params', async () => {
    await mod.listTemplates({ scope: 'shared' })
    expect(mockGet).toHaveBeenCalledWith('/portal/contact-book/templates', {
      params: { scope: 'shared' },
    })
  })

  it('createTemplate POST /portal/contact-book/templates', async () => {
    const payload = { name: '範本 A', scope: 'personal' }
    await mod.createTemplate(payload)
    expect(mockPost).toHaveBeenCalledWith('/portal/contact-book/templates', payload)
  })

  it('updateTemplate PATCH /portal/contact-book/templates/:id', async () => {
    await mod.updateTemplate(42, { name: '更名' })
    expect(mockPatch).toHaveBeenCalledWith('/portal/contact-book/templates/42', { name: '更名' })
  })

  it('archiveTemplate DELETE /portal/contact-book/templates/:id', async () => {
    await mod.archiveTemplate(42)
    expect(mockDelete).toHaveBeenCalledWith('/portal/contact-book/templates/42')
  })

  it('promoteTemplate POST /portal/contact-book/templates/:id/promote', async () => {
    await mod.promoteTemplate(42)
    expect(mockPost).toHaveBeenCalledWith('/portal/contact-book/templates/42/promote')
  })
})
