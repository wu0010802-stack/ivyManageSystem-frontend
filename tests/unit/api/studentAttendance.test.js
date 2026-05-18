/**
 * tests/unit/api/studentAttendance.test.js
 *
 * 薄殼測試：驗 src/api/studentAttendance.ts wrapper 把 HTTP method/URL/params
 * 正確轉發給 @/api/index axios 實例。不涉及業務邏輯。
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

import * as mod from '@/api/studentAttendance'

describe('studentAttendance api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockPatch.mockReset()
  })

  it('getAttendanceOverview GET /student-attendance/overview with params', async () => {
    mockGet.mockResolvedValue({ data: {} })
    await mod.getAttendanceOverview({ date: '2026-05-17' })
    expect(mockGet).toHaveBeenCalledWith('/student-attendance/overview', {
      params: { date: '2026-05-17' },
    })
  })

  it('getDailyAttendance GET /student-attendance with params', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.getDailyAttendance({ date: '2026-05-17', classroom_id: 3 })
    expect(mockGet).toHaveBeenCalledWith('/student-attendance', {
      params: { date: '2026-05-17', classroom_id: 3 },
    })
  })

  it('batchSaveAttendance POST /student-attendance/batch with body', async () => {
    mockPost.mockResolvedValue({ data: { ok: true } })
    const payload = {
      date: '2026-05-17',
      records: [{ student_id: 42, status: 'present' }],
    }
    await mod.batchSaveAttendance(payload)
    expect(mockPost).toHaveBeenCalledWith('/student-attendance/batch', payload)
  })

  it('getMonthlySummary GET /student-attendance/monthly with params', async () => {
    mockGet.mockResolvedValue({ data: {} })
    await mod.getMonthlySummary({ year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/student-attendance/monthly', {
      params: { year: 2026, month: 5 },
    })
  })

  it('exportStudentAttendance GET /student-attendance/export with responseType blob', async () => {
    mockGet.mockResolvedValue({ data: new Blob() })
    await mod.exportStudentAttendance({ year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/student-attendance/export', {
      params: { year: 2026, month: 5 },
      responseType: 'blob',
    })
  })

  it('getAttendanceByStudent merges student_id into params', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.getAttendanceByStudent(42, { start: '2026-05-01', end: '2026-05-31' })
    expect(mockGet).toHaveBeenCalledWith('/student-attendance/by-student', {
      params: { student_id: 42, start: '2026-05-01', end: '2026-05-31' },
    })
  })

  it('getAttendanceByStudent works without extra params', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await mod.getAttendanceByStudent(99)
    expect(mockGet).toHaveBeenCalledWith('/student-attendance/by-student', {
      params: { student_id: 99 },
    })
  })
})
