/**
 * tests/unit/api/shifts.test.js
 *
 * 驗證 src/api/shifts.ts wrapper：HTTP method / URL / payload / blob / multipart / inline query。
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

import * as mod from '@/api/shifts'

describe('shifts api', () => {
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

  it('getShiftTypes GET /shifts/types', async () => {
    await mod.getShiftTypes()
    expect(mockGet).toHaveBeenCalledWith('/shifts/types', { params: undefined })
  })

  it('getShiftTypes 可帶 include_usage（設定頁使用數）', async () => {
    await mod.getShiftTypes({ include_usage: true })
    expect(mockGet).toHaveBeenCalledWith('/shifts/types', {
      params: { include_usage: true },
    })
  })

  it('getScheduleRoster GET /shifts/roster（排班最小名冊，非 /employees）', async () => {
    await mod.getScheduleRoster()
    expect(mockGet).toHaveBeenCalledWith('/shifts/roster', { params: undefined })
  })

  it('copyMonthAssignments POST /shifts/copy-month（整月複製走後端單一 transaction）', async () => {
    const payload = {
      source_year: 2026,
      source_month: 9,
      target_year: 2026,
      target_month: 10,
      mode: 'overwrite',
      dry_run: true,
    }
    await mod.copyMonthAssignments(payload)
    expect(mockPost).toHaveBeenCalledWith('/shifts/copy-month', payload)
  })

  it('createShiftType POST /shifts/types', async () => {
    const payload = { name: '早班', start: '08:00', end: '17:00' }
    await mod.createShiftType(payload)
    expect(mockPost).toHaveBeenCalledWith('/shifts/types', payload)
  })

  it('updateShiftType PUT /shifts/types/:id', async () => {
    const payload = { name: '晚班' }
    await mod.updateShiftType(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/shifts/types/42', payload)
  })

  it('deleteShiftType DELETE /shifts/types/:id', async () => {
    await mod.deleteShiftType(42)
    expect(mockDelete).toHaveBeenCalledWith('/shifts/types/42')
  })

  it('getAssignments GET /shifts/assignments with params', async () => {
    await mod.getAssignments({ week_start: '2026-05-12' })
    expect(mockGet).toHaveBeenCalledWith('/shifts/assignments', {
      params: { week_start: '2026-05-12' },
    })
  })

  it('saveAssignments POST /shifts/assignments', async () => {
    const payload = { week_start: '2026-05-12', assignments: [] }
    await mod.saveAssignments(payload)
    expect(mockPost).toHaveBeenCalledWith('/shifts/assignments', payload)
  })

  it('getDaily GET /shifts/daily with params', async () => {
    await mod.getDaily({ date: '2026-05-17' })
    expect(mockGet).toHaveBeenCalledWith('/shifts/daily', { params: { date: '2026-05-17' } })
  })

  it('saveDaily POST /shifts/daily（指定班別）', async () => {
    const payload = { employee_id: 7, shift_type_id: 3, date: '2026-05-17' }
    await mod.saveDaily(payload)
    expect(mockPost).toHaveBeenCalledWith('/shifts/daily', payload)
  })

  it('saveDaily POST /shifts/daily（day_off 明確排休三態）', async () => {
    const payload = { employee_id: 7, day_off: true, date: '2026-05-17' }
    await mod.saveDaily(payload)
    expect(mockPost).toHaveBeenCalledWith('/shifts/daily', payload)
  })

  it('deleteDaily DELETE /shifts/daily/:id', async () => {
    await mod.deleteDaily(42)
    expect(mockDelete).toHaveBeenCalledWith('/shifts/daily/42')
  })

  it('getSwapHistory GET /shifts/swap-history with params', async () => {
    await mod.getSwapHistory({ status: 'pending' })
    expect(mockGet).toHaveBeenCalledWith('/shifts/swap-history', { params: { status: 'pending' } })
  })

  it('getShiftImportTemplate GET /shifts/import-template with blob', async () => {
    await mod.getShiftImportTemplate()
    expect(mockGet).toHaveBeenCalledWith('/shifts/import-template', { responseType: 'blob' })
  })

  it('importShifts POST /shifts/import?week_start=... with multipart headers', async () => {
    const fd = new FormData()
    await mod.importShifts(fd, '2026-05-12')
    expect(mockPost).toHaveBeenCalledWith('/shifts/import?week_start=2026-05-12', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('exportShifts GET /exports/shifts with blob + params', async () => {
    await mod.exportShifts('2026-05-12')
    expect(mockGet).toHaveBeenCalledWith('/exports/shifts', {
      params: { week_start: '2026-05-12' },
      responseType: 'blob',
    })
  })
})
