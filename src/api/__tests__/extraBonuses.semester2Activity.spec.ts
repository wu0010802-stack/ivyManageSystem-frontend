import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn() },
}))

import api from '@/api/index'
import { applySemester2Activity, previewSemester2Activity } from '../extraBonuses'

describe('下學期才藝獎勵金 8 月批次 API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('預覽：GET /extra-bonuses/semester2-activity/preview，academic_year 走 query', () => {
    previewSemester2Activity({ academic_year: 114 })
    expect(api.get).toHaveBeenCalledWith('/extra-bonuses/semester2-activity/preview', {
      params: { academic_year: 114 },
    })
  })

  it('套用：POST /extra-bonuses/semester2-activity/apply，academic_year 走 body', () => {
    applySemester2Activity({ academic_year: 114 })
    expect(api.post).toHaveBeenCalledWith('/extra-bonuses/semester2-activity/apply', { academic_year: 114 })
  })
})
