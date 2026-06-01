import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from '@/api'
import {
  getFeeAdjustments,
  createFeeAdjustment,
  updateFeeAdjustment,
  deleteFeeAdjustment,
} from '../fees'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

describe('fees adjustments API wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getFeeAdjustments → GET /fees/adjustments 帶 params 並解包 data', async () => {
    asMock(api.get).mockResolvedValue({ data: { items: [], total: 0 } })
    const res = await getFeeAdjustments({ student_id: 5, period: '114-2' })
    expect(api.get).toHaveBeenCalledWith('/fees/adjustments', {
      params: { student_id: 5, period: '114-2' },
    })
    expect(res).toEqual({ items: [], total: 0 })
  })

  it('createFeeAdjustment → POST /fees/adjustments 帶 body 並解包 data', async () => {
    asMock(api.post).mockResolvedValue({ data: { id: 1 } })
    const res = await createFeeAdjustment({
      student_id: 5,
      period: '114-2',
      adjustment_type: 'leave_deduction',
      amount: 300,
    })
    expect(api.post).toHaveBeenCalledWith('/fees/adjustments', {
      student_id: 5,
      period: '114-2',
      adjustment_type: 'leave_deduction',
      amount: 300,
    })
    expect(res).toEqual({ id: 1 })
  })

  it('updateFeeAdjustment → PUT /fees/adjustments/:id 帶 body 並解包 data', async () => {
    asMock(api.put).mockResolvedValue({ data: { id: 7 } })
    const res = await updateFeeAdjustment(7, { amount: 500, reason: '改額' })
    expect(api.put).toHaveBeenCalledWith('/fees/adjustments/7', {
      amount: 500,
      reason: '改額',
    })
    expect(res).toEqual({ id: 7 })
  })

  it('deleteFeeAdjustment → DELETE /fees/adjustments/:id 並解包 data', async () => {
    asMock(api.delete).mockResolvedValue({ data: { deleted: 7 } })
    const res = await deleteFeeAdjustment(7)
    expect(api.delete).toHaveBeenCalledWith('/fees/adjustments/7')
    expect(res).toEqual({ deleted: 7 })
  })
})
