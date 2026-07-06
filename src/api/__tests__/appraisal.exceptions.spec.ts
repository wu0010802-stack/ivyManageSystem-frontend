import { describe, it, expect, vi } from 'vitest'

vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import api from '@/api/index'
import { getAppraisalCycleExceptions } from '../appraisal'

describe('getAppraisalCycleExceptions', () => {
  it('GET /appraisal/cycles/{cycle_id}/exceptions', () => {
    getAppraisalCycleExceptions(7)
    expect(api.get).toHaveBeenCalledWith('/appraisal/cycles/7/exceptions')
  })
})
