/**
 * tests/unit/api/overtimes.test.js
 *
 * 驗證 src/api/overtimes.ts wrapper：HTTP method / URL / payload / multipart / blob。
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

import * as mod from '@/api/overtimes'

describe('overtimes api', () => {
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

  it('getOvertimes 一律帶 page/page_size 並回正規化的 PagedResult', async () => {
    mockGet.mockResolvedValue({ data: { items: [{ id: 1 }], total: 1, page: 1, page_size: 5000 } })
    const res = await mod.getOvertimes({ status: 'pending' })
    expect(mockGet).toHaveBeenCalledWith('/overtimes', {
      params: { status: 'pending', page: 1, page_size: 5000 },
    })
    expect(res.items).toEqual([{ id: 1 }])
    expect(res.total).toBe(1)
  })

  it('createOvertime POST /overtimes', async () => {
    const payload = { employee_id: 42, hours: 2 }
    await mod.createOvertime(payload)
    expect(mockPost).toHaveBeenCalledWith('/overtimes', payload)
  })

  it('updateOvertime PUT /overtimes/:id', async () => {
    const payload = { hours: 3 }
    await mod.updateOvertime(99, payload)
    expect(mockPut).toHaveBeenCalledWith('/overtimes/99', payload)
  })

  it('approveOvertime PUT /overtimes/:id/approve', async () => {
    const payload = { approved: true }
    await mod.approveOvertime(99, payload)
    expect(mockPut).toHaveBeenCalledWith('/overtimes/99/approve', payload)
  })

  it('batchApproveOvertimes POST /overtimes/batch-approve', async () => {
    await mod.batchApproveOvertimes([1, 2, 3], true)
    expect(mockPost).toHaveBeenCalledWith('/overtimes/batch-approve', {
      ids: [1, 2, 3],
      approved: true,
      rejection_reason: undefined,
    })
  })

  it('batchApproveOvertimes POST /overtimes/batch-approve with rejection_reason', async () => {
    await mod.batchApproveOvertimes([1, 2], false, '理由不足')
    expect(mockPost).toHaveBeenCalledWith('/overtimes/batch-approve', {
      ids: [1, 2],
      approved: false,
      rejection_reason: '理由不足',
    })
  })

  it('getOvertimeImportTemplate GET /overtimes/import-template as blob', async () => {
    await mod.getOvertimeImportTemplate()
    expect(mockGet).toHaveBeenCalledWith('/overtimes/import-template', {
      responseType: 'blob',
    })
  })

  it('importOvertimes POST /overtimes/import as multipart', async () => {
    const fd = new FormData()
    await mod.importOvertimes(fd)
    expect(mockPost).toHaveBeenCalledWith('/overtimes/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })
})
