/**
 * tests/unit/api/studentLeaves.test.js
 *
 * 薄殼測試：驗 src/api/studentLeaves.js wrapper 把 HTTP method/URL/params
 * 正確轉發給 @/api/index axios 實例。後端 /api/student-leaves 唯讀。
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

import * as mod from '@/api/studentLeaves'

describe('studentLeaves api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
  })

  it('listStudentLeaves GET /student-leaves with params', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.listStudentLeaves({ student_id: 42, start: '2026-05-01' })
    expect(mockGet).toHaveBeenCalledWith('/student-leaves', {
      params: { student_id: 42, start: '2026-05-01' },
    })
  })

  it('listStudentLeaves defaults params to empty object', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.listStudentLeaves()
    expect(mockGet).toHaveBeenCalledWith('/student-leaves', { params: {} })
  })
})
