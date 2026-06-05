/**
 * tests/unit/api/studentEnrollment.test.js
 *
 * 薄殼測試：驗 src/api/studentEnrollment.ts wrapper 把 HTTP method/URL/params
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

import * as mod from '@/api/studentEnrollment'

describe('studentEnrollment api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
  })

  it('getEnrollmentStats GET /student-enrollment/stats with params', async () => {
    mockGet.mockResolvedValue({ data: {} })
    await mod.getEnrollmentStats({ school_year: 114, semester: 1 })
    expect(mockGet).toHaveBeenCalledWith('/student-enrollment/stats', {
      params: { school_year: 114, semester: 1 },
    })
  })

  it('getEnrollmentOptions GET /student-enrollment/options without params', async () => {
    mockGet.mockResolvedValue({ data: {} })
    await mod.getEnrollmentOptions()
    expect(mockGet).toHaveBeenCalledWith('/student-enrollment/options')
  })

  it('getEnrollmentRoster GET /student-enrollment/roster with params', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.getEnrollmentRoster({ school_year: 114, semester: 1, grade_id: 2 })
    expect(mockGet).toHaveBeenCalledWith('/student-enrollment/roster', {
      params: { school_year: 114, semester: 1, grade_id: 2 },
    })
  })
})
