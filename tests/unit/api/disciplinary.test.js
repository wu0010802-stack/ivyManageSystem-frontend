/**
 * tests/unit/api/disciplinary.test.js
 *
 * 驗證 src/api/disciplinary.ts wrapper。
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

import * as mod from '@/api/disciplinary'

describe('disciplinary api', () => {
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
  })

  it('listDisciplinaryActions GET /disciplinary-actions 預設無 filter', async () => {
    await mod.listDisciplinaryActions()
    expect(mockGet).toHaveBeenCalledWith('/disciplinary-actions', { params: {} })
  })

  it('listDisciplinaryActions GET /disciplinary-actions with params', async () => {
    await mod.listDisciplinaryActions({ employee_id: 42, type: 'warning' })
    expect(mockGet).toHaveBeenCalledWith('/disciplinary-actions', {
      params: { employee_id: 42, type: 'warning' },
    })
  })

  it('createDisciplinaryAction POST /disciplinary-actions', async () => {
    const payload = {
      employee_id: 42,
      type: 'minor',
      reason: '遲到三次',
      deduction_amount: 3000,
    }
    await mod.createDisciplinaryAction(payload)
    expect(mockPost).toHaveBeenCalledWith('/disciplinary-actions', payload)
  })

  it('updateDisciplinaryAction PUT /disciplinary-actions/:id', async () => {
    await mod.updateDisciplinaryAction(42, { deduction_amount: 1000 })
    expect(mockPut).toHaveBeenCalledWith('/disciplinary-actions/42', {
      deduction_amount: 1000,
    })
  })

  it('deleteDisciplinaryAction DELETE /disciplinary-actions/:id', async () => {
    await mod.deleteDisciplinaryAction(42)
    expect(mockDelete).toHaveBeenCalledWith('/disciplinary-actions/42')
  })
})
