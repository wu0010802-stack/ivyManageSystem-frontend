/**
 * tests/unit/api/artTeacherPayroll.test.js
 *
 * 驗證 src/api/artTeacherPayroll.ts wrapper。
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

import * as mod from '@/api/artTeacherPayroll'

describe('artTeacherPayroll api', () => {
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

  it('listArtPayroll GET /art-teacher-payroll with year/month', async () => {
    await mod.listArtPayroll(2026, 5)
    expect(mockGet).toHaveBeenCalledWith('/art-teacher-payroll', {
      params: { year: 2026, month: 5 },
    })
  })

  it('listArtPayroll GET /art-teacher-payroll 帶 employee_id 當 employeeId 非 null', async () => {
    await mod.listArtPayroll(2026, 5, 42)
    expect(mockGet).toHaveBeenCalledWith('/art-teacher-payroll', {
      params: { year: 2026, month: 5, employee_id: 42 },
    })
  })

  it('listArtPayroll 不傳 employeeId 不該帶 employee_id key', async () => {
    await mod.listArtPayroll(2026, 5)
    const calledParams = mockGet.mock.calls[0][1].params
    expect(calledParams).not.toHaveProperty('employee_id')
  })

  it('createArtPayroll POST /art-teacher-payroll', async () => {
    const payload = { employee_id: 7, subject: 'art', hours: 10 }
    await mod.createArtPayroll(payload)
    expect(mockPost).toHaveBeenCalledWith('/art-teacher-payroll', payload)
  })

  it('updateArtPayroll PUT /art-teacher-payroll/:id', async () => {
    await mod.updateArtPayroll(42, { hours: 12 })
    expect(mockPut).toHaveBeenCalledWith('/art-teacher-payroll/42', { hours: 12 })
  })

  it('deleteArtPayroll DELETE /art-teacher-payroll/:id', async () => {
    await mod.deleteArtPayroll(42)
    expect(mockDelete).toHaveBeenCalledWith('/art-teacher-payroll/42')
  })

  it('batchImportArtPayroll POST 帶 query string + FormData + multipart header', async () => {
    const file = new File(['dummy'], 'payroll.xlsx')
    await mod.batchImportArtPayroll(2026, 5, file, true)
    expect(mockPost).toHaveBeenCalledTimes(1)
    const [url, formData, opts] = mockPost.mock.calls[0]
    expect(url).toBe('/art-teacher-payroll/batch-import?year=2026&month=5&replace_existing=true')
    expect(formData).toBeInstanceOf(FormData)
    expect(formData.get('file')).toBe(file)
    expect(opts).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
  })

  it('batchImportArtPayroll 預設 replace_existing=false', async () => {
    const file = new File(['dummy'], 'payroll.xlsx')
    await mod.batchImportArtPayroll(2026, 5, file)
    expect(mockPost.mock.calls[0][0]).toBe(
      '/art-teacher-payroll/batch-import?year=2026&month=5&replace_existing=false',
    )
  })
})
