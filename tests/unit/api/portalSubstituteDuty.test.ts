import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/index', () => ({ default: { get: vi.fn() } }))

import api from '@/api/index'
import { getSubstituteDutyPreview } from '@/api/portalSubstituteDuty'

describe('portalSubstituteDuty api', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getSubstituteDutyPreview 以 query 參數呼叫 /portal/substitute-duty-preview', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} })
    const params = { start_date: '2026-09-15', end_date: '2026-09-15', substitute_employee_id: 7 }
    await getSubstituteDutyPreview(params)
    expect(api.get).toHaveBeenCalledWith('/portal/substitute-duty-preview', { params })
  })
})
