/**
 * tests/unit/api/studentChangeLogs.test.js
 *
 * 薄殼測試：驗 src/api/studentChangeLogs.ts wrapper 把 HTTP method/URL/params/body
 * 正確轉發給 @/api/index axios 實例。
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

import * as mod from '@/api/studentChangeLogs'

describe('studentChangeLogs api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
  })

  it('getChangeLogOptions GET /students/change-logs/options', async () => {
    mockGet.mockResolvedValue({ data: {} })
    await mod.getChangeLogOptions()
    expect(mockGet).toHaveBeenCalledWith('/students/change-logs/options')
  })

  it('getChangeLogsSummary GET /students/change-logs/summary with params', async () => {
    mockGet.mockResolvedValue({ data: {} })
    await mod.getChangeLogsSummary({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/students/change-logs/summary', {
      params: { year: 2026 },
    })
  })

  it('getChangeLogs GET /students/change-logs with params', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.getChangeLogs({ student_id: 42, type: 'graduated' })
    expect(mockGet).toHaveBeenCalledWith('/students/change-logs', {
      params: { student_id: 42, type: 'graduated' },
    })
  })

  it('createChangeLog POST /students/change-logs with body', async () => {
    mockPost.mockResolvedValue({ data: { id: 1 } })
    const payload = { student_id: 42, change_type: 'withdrawn', effective_date: '2026-05-17' }
    await mod.createChangeLog(payload)
    expect(mockPost).toHaveBeenCalledWith('/students/change-logs', payload)
  })

  it('updateChangeLog PUT /students/change-logs/:id with body', async () => {
    mockPut.mockResolvedValue({ data: {} })
    const payload = { note: '修正備註' }
    await mod.updateChangeLog(99, payload)
    expect(mockPut).toHaveBeenCalledWith('/students/change-logs/99', payload)
  })

  it('deleteChangeLog DELETE /students/change-logs/:id', async () => {
    mockDelete.mockResolvedValue({ data: {} })
    await mod.deleteChangeLog(99)
    expect(mockDelete).toHaveBeenCalledWith('/students/change-logs/99')
  })

  it('exportChangeLogs GET /students/change-logs/export with responseType blob', async () => {
    mockGet.mockResolvedValue({ data: new Blob() })
    await mod.exportChangeLogs({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/students/change-logs/export', {
      params: { year: 2026 },
      responseType: 'blob',
    })
  })
})
