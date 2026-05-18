/**
 * tests/unit/api/approvalSettings.test.js
 *
 * 驗證 src/api/approvalSettings.ts wrapper：HTTP method / URL / payload 對齊。
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

import * as mod from '@/api/approvalSettings'

describe('approvalSettings api', () => {
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

  it('getApprovalPolicies GET /approval-settings/policies', async () => {
    await mod.getApprovalPolicies()
    expect(mockGet).toHaveBeenCalledWith('/approval-settings/policies')
  })

  it('updateApprovalPolicies PUT /approval-settings/policies 帶 policies wrapper', async () => {
    const policies = [{ doc_type: 'leave', steps: [] }]
    await mod.updateApprovalPolicies(policies)
    expect(mockPut).toHaveBeenCalledWith('/approval-settings/policies', { policies })
  })

  it('getApprovalLogs GET /approval-settings/logs with params', async () => {
    await mod.getApprovalLogs('leave', 42)
    expect(mockGet).toHaveBeenCalledWith('/approval-settings/logs', {
      params: { doc_type: 'leave', doc_id: 42 },
    })
  })
})
