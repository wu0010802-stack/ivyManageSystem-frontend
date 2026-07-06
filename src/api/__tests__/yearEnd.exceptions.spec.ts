import { describe, it, expect, vi } from 'vitest'

vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import api from '@/api/index'
import { getYearEndCycleExceptions } from '../yearEnd'

describe('getYearEndCycleExceptions', () => {
  it('GET /year_end/cycles/{cycle_id}/exceptions', () => {
    getYearEndCycleExceptions(3)
    expect(api.get).toHaveBeenCalledWith('/year_end/cycles/3/exceptions')
  })
})
