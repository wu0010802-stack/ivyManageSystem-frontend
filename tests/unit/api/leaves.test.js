/**
 * tests/unit/api/leaves.test.js
 *
 * 驗證 src/api/leaves.ts wrapper：HTTP method / URL / payload / multipart / blob / null body。
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

import * as mod from '@/api/leaves'

describe('leaves api', () => {
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

  it('getLeaves GET /leaves with params', async () => {
    await mod.getLeaves({ status: 'pending' })
    expect(mockGet).toHaveBeenCalledWith('/leaves', { params: { status: 'pending' } })
  })

  it('createLeave POST /leaves', async () => {
    const payload = { employee_id: 42, leave_type: 'annual' }
    await mod.createLeave(payload)
    expect(mockPost).toHaveBeenCalledWith('/leaves', payload)
  })

  it('updateLeave PUT /leaves/:id', async () => {
    const payload = { reason: 'updated' }
    await mod.updateLeave(99, payload)
    expect(mockPut).toHaveBeenCalledWith('/leaves/99', payload)
  })

  it('approveLeave PUT /leaves/:id/approve', async () => {
    const payload = { approved: true }
    await mod.approveLeave(99, payload)
    expect(mockPut).toHaveBeenCalledWith('/leaves/99/approve', payload)
  })

  it('getLeaveAttachment GET /leaves/:id/attachments/:filename as blob', async () => {
    await mod.getLeaveAttachment(99, 'doc.pdf')
    expect(mockGet).toHaveBeenCalledWith('/leaves/99/attachments/doc.pdf', {
      responseType: 'blob',
    })
  })

  it('uploadLeaveAttachments POST /leaves/:id/attachments as multipart', async () => {
    const fd = new FormData()
    await mod.uploadLeaveAttachments(99, fd)
    expect(mockPost).toHaveBeenCalledWith('/leaves/99/attachments', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('getLeaveQuotas GET /leaves/quotas with params', async () => {
    await mod.getLeaveQuotas({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/leaves/quotas', { params: { year: 2026 } })
  })

  it('updateLeaveQuota PUT /leaves/quotas/:id', async () => {
    const payload = { days: 14 }
    await mod.updateLeaveQuota(7, payload)
    expect(mockPut).toHaveBeenCalledWith('/leaves/quotas/7', payload)
  })

  it('initLeaveQuotas POST /leaves/quotas/init with null body and params', async () => {
    await mod.initLeaveQuotas({ year: 2026 })
    expect(mockPost).toHaveBeenCalledWith('/leaves/quotas/init', null, {
      params: { year: 2026 },
    })
  })

  it('getWorkdayHours GET /leaves/workday-hours with params', async () => {
    await mod.getWorkdayHours({ year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/leaves/workday-hours', {
      params: { year: 2026, month: 5 },
    })
  })

  it('batchApproveLeaves POST /leaves/batch-approve', async () => {
    await mod.batchApproveLeaves([1, 2, 3], true)
    expect(mockPost).toHaveBeenCalledWith('/leaves/batch-approve', {
      ids: [1, 2, 3],
      approved: true,
      rejection_reason: undefined,
    })
  })

  it('batchApproveLeaves POST /leaves/batch-approve with rejection_reason', async () => {
    await mod.batchApproveLeaves([1, 2], false, '證明文件不全')
    expect(mockPost).toHaveBeenCalledWith('/leaves/batch-approve', {
      ids: [1, 2],
      approved: false,
      rejection_reason: '證明文件不全',
    })
  })

  it('getLeaveImportTemplate GET /leaves/import-template as blob', async () => {
    await mod.getLeaveImportTemplate()
    expect(mockGet).toHaveBeenCalledWith('/leaves/import-template', {
      responseType: 'blob',
    })
  })

  it('importLeaves POST /leaves/import as multipart', async () => {
    const fd = new FormData()
    await mod.importLeaves(fd)
    expect(mockPost).toHaveBeenCalledWith('/leaves/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })
})
