import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import { getStudentDetail } from '@/api/portalStudentDetail'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn() },
}))

describe('portalStudentDetail api', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('getStudentDetail hits /portal/students/{id}/detail', async () => {
    api.get.mockResolvedValue({ data: { id: 42, name: '王小明' } })
    await getStudentDetail(42)
    expect(api.get).toHaveBeenCalledWith('/portal/students/42/detail')
  })
})
