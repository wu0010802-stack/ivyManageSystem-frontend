import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/index', () => ({
  default: { defaults: { baseURL: '/api' }, get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import api from '@/api/index'
import { listUnroundedConfirmationItems } from '../attendanceConfirmation'

beforeEach(() => { vi.clearAllMocks() })

describe('attendanceConfirmation API', () => {
  it('老師自行補登清單：固定帶 unrounded=true（後端不帶或 false 會 400）', () => {
    listUnroundedConfirmationItems({ start_date: '2026-09-01', end_date: '2026-09-30' })
    expect(api.get).toHaveBeenCalledWith('/attendance/confirmation-items', {
      params: { start_date: '2026-09-01', end_date: '2026-09-30', unrounded: true },
    })
  })
})
