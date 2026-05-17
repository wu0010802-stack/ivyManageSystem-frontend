/**
 * tests/unit/api/attendance.test.js
 *
 * 驗證 src/api/attendance.js wrapper：HTTP method / URL / payload / multipart / blob。
 * 不驗考勤計算邏輯。
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

import * as mod from '@/api/attendance'

describe('attendance api', () => {
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

  it('uploadFile POST /attendance/upload as multipart', async () => {
    const fd = new FormData()
    await mod.uploadFile(fd)
    expect(mockPost).toHaveBeenCalledWith('/attendance/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('uploadCsv POST /attendance/upload-csv with payload', async () => {
    const payload = { rows: [] }
    await mod.uploadCsv(payload)
    expect(mockPost).toHaveBeenCalledWith('/attendance/upload-csv', payload)
  })

  it('getRecords GET /attendance/records with params', async () => {
    await mod.getRecords({ year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/attendance/records', {
      params: { year: 2026, month: 5 },
    })
  })

  it('getSummary GET /attendance/summary with params', async () => {
    await mod.getSummary({ year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/attendance/summary', {
      params: { year: 2026, month: 5 },
    })
  })

  it('deleteMonthRecords DELETE /attendance/records/:year/:month', async () => {
    await mod.deleteMonthRecords(2026, 5)
    expect(mockDelete).toHaveBeenCalledWith('/attendance/records/2026/5')
  })

  it('deleteEmployeeDateRecord DELETE /attendance/records/:employeeId/:date', async () => {
    await mod.deleteEmployeeDateRecord(42, '2026-05-17')
    expect(mockDelete).toHaveBeenCalledWith('/attendance/records/42/2026-05-17')
  })

  it('getToday GET /attendance/today', async () => {
    await mod.getToday()
    expect(mockGet).toHaveBeenCalledWith('/attendance/today')
  })

  it('getTodayAnomalies GET /attendance/today-anomalies with params', async () => {
    await mod.getTodayAnomalies({ classroom_id: 1 })
    expect(mockGet).toHaveBeenCalledWith('/attendance/today-anomalies', {
      params: { classroom_id: 1 },
    })
  })

  it('getAnomalyList GET /attendance/anomalies with params', async () => {
    await mod.getAnomalyList({ year: 2026, month: 5, status: 'pending' })
    expect(mockGet).toHaveBeenCalledWith('/attendance/anomalies', {
      params: { year: 2026, month: 5, status: 'pending' },
    })
  })

  it('batchConfirmAnomalies POST /attendance/anomalies/batch-confirm', async () => {
    const payload = { ids: [1, 2, 3], action: 'confirm' }
    await mod.batchConfirmAnomalies(payload)
    expect(mockPost).toHaveBeenCalledWith('/attendance/anomalies/batch-confirm', payload)
  })

  it('exportAnomalies GET /attendance/anomalies/export as blob (default status)', async () => {
    await mod.exportAnomalies(2026, 5)
    expect(mockGet).toHaveBeenCalledWith('/attendance/anomalies/export', {
      params: { year: 2026, month: 5, status: 'all' },
      responseType: 'blob',
    })
  })

  it('exportAnomalies GET /attendance/anomalies/export as blob (explicit status)', async () => {
    await mod.exportAnomalies(2026, 5, 'pending')
    expect(mockGet).toHaveBeenCalledWith('/attendance/anomalies/export', {
      params: { year: 2026, month: 5, status: 'pending' },
      responseType: 'blob',
    })
  })

  it('exportEmployeeAttendance GET /exports/employee-attendance as blob', async () => {
    await mod.exportEmployeeAttendance({ employee_id: 42, year: 2026, month: 5 })
    expect(mockGet).toHaveBeenCalledWith('/exports/employee-attendance', {
      params: { employee_id: 42, year: 2026, month: 5 },
      responseType: 'blob',
    })
  })
})
