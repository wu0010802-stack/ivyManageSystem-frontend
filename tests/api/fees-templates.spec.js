/**
 * tests/api/fees-templates.spec.js
 *
 * 驗證 fees.js 範本端點 wrapper：
 * getFeeTemplates / createFeeTemplate / updateFeeTemplate / deleteFeeTemplate
 *
 * 註：src/api/fees.js 採 `import api from './index'` 慣例，
 * 因此這裡 mock 的是 @/api/index 模組（與 govData.spec.js 同樣 pattern），
 * 而非 spec 範例的 `vi.mock('axios')`。
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

import {
  getFeeTemplates,
  createFeeTemplate,
  updateFeeTemplate,
  deleteFeeTemplate,
} from '@/api/fees'

describe('fees.js — templates', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
  })

  it('getFeeTemplates GET /fees/templates with filter', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await getFeeTemplates({ school_year: 114, semester: 1 })
    expect(mockGet).toHaveBeenCalledWith('/fees/templates', {
      params: { school_year: 114, semester: 1 },
    })
  })

  it('createFeeTemplate POST /fees/templates', async () => {
    mockPost.mockResolvedValue({ data: { id: 1 } })
    const payload = {
      grade_id: 1,
      school_year: 114,
      semester: 1,
      fee_type: 'registration',
      name: 'x',
      amount: 19000,
    }
    await createFeeTemplate(payload)
    expect(mockPost).toHaveBeenCalledWith('/fees/templates', payload)
  })

  it('updateFeeTemplate PUT /fees/templates/:id', async () => {
    mockPut.mockResolvedValue({ data: {} })
    await updateFeeTemplate(5, { amount: 20000 })
    expect(mockPut).toHaveBeenCalledWith('/fees/templates/5', { amount: 20000 })
  })

  it('deleteFeeTemplate DELETE /fees/templates/:id', async () => {
    mockDelete.mockResolvedValue({ data: {} })
    await deleteFeeTemplate(5)
    expect(mockDelete).toHaveBeenCalledWith('/fees/templates/5')
  })
})
