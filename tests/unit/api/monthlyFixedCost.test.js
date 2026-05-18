/**
 * tests/unit/api/monthlyFixedCost.test.js
 *
 * 驗證 src/api/monthlyFixedCost.ts wrapper：
 *  - 4 個 endpoint 路徑與 method 正確（不重複加 /api 前綴）
 *  - get / put / delete 各自接 .data unwrap
 *  - batch 對應 PUT /monthly-fixed-costs/batch
 *
 * Mock pattern 模仿 tests/unit/api/reports.test.js。
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

import * as mod from '@/api/monthlyFixedCost'

describe('monthlyFixedCost api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
  })

  it('getMonthlyFixedCosts GET /monthly-fixed-costs?year', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 1, year: 2026 }] })
    const out = await mod.getMonthlyFixedCosts(2026)
    expect(mockGet).toHaveBeenCalledWith('/monthly-fixed-costs', {
      params: { year: 2026 },
    })
    // .data unwrap
    expect(out).toEqual([{ id: 1, year: 2026 }])
  })

  it('upsertMonthlyFixedCost PUT /monthly-fixed-costs with payload', async () => {
    mockPut.mockResolvedValue({ data: { id: 9 } })
    const payload = { year: 2026, month: 5, category: 'rent', amount: 500000 }
    const out = await mod.upsertMonthlyFixedCost(payload)
    expect(mockPut).toHaveBeenCalledWith('/monthly-fixed-costs', payload)
    expect(out).toEqual({ id: 9 })
  })

  it('batchUpsertMonthlyFixedCosts PUT /monthly-fixed-costs/batch with year + entries', async () => {
    mockPut.mockResolvedValue({ data: { count: 2 } })
    const entries = [
      { month: 1, category: 'rent', amount: 500000 },
      { month: 2, category: 'water', amount: 5989 },
    ]
    const out = await mod.batchUpsertMonthlyFixedCosts(2026, entries)
    expect(mockPut).toHaveBeenCalledWith('/monthly-fixed-costs/batch', {
      year: 2026,
      entries,
    })
    expect(out).toEqual({ count: 2 })
  })

  it('deleteMonthlyFixedCost DELETE /monthly-fixed-costs/:id', async () => {
    mockDelete.mockResolvedValue({ data: { ok: true } })
    const out = await mod.deleteMonthlyFixedCost(42)
    expect(mockDelete).toHaveBeenCalledWith('/monthly-fixed-costs/42')
    expect(out).toEqual({ ok: true })
  })
})
