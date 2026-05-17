/**
 * tests/unit/api/audit.test.js
 *
 * 薄殼測試：驗證 src/api/audit.js wrapper（含 responseType: 'blob' 匯出端點）。
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

import * as mod from '@/api/audit'

describe('audit api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({ data: {} })
  })

  it('getAuditLogs GET /audit-logs with params', async () => {
    const params = { action: 'login', limit: 50 }
    await mod.getAuditLogs(params)
    expect(mockGet).toHaveBeenCalledWith('/audit-logs', { params })
  })

  it('getAuditLogsMeta GET /audit-logs/meta', async () => {
    await mod.getAuditLogsMeta()
    expect(mockGet).toHaveBeenCalledWith('/audit-logs/meta')
  })

  it('exportAuditLogs GET /audit-logs/export with responseType blob', async () => {
    const params = { start: '2026-05-01', end: '2026-05-17' }
    await mod.exportAuditLogs(params)
    expect(mockGet).toHaveBeenCalledWith('/audit-logs/export', {
      params,
      responseType: 'blob',
    })
  })
})
