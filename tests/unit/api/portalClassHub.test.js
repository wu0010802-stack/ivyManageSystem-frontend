import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import { getTodayHub } from '@/api/portalClassHub'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn() },
}))

describe('portalClassHub api', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('getTodayHub 不帶 classroomId 時打 /portal/class-hub/today 並帶空 params', async () => {
    const payload = { classroom_id: 7, students: [] }
    api.get.mockResolvedValue({ data: payload })
    const result = await getTodayHub()
    expect(api.get).toHaveBeenCalledWith('/portal/class-hub/today', { params: {} })
    expect(result).toEqual(payload)
  })

  it('getTodayHub 帶 classroomId 時 params 附上 classroom_id', async () => {
    const payload = { classroom_id: 3, students: [] }
    api.get.mockResolvedValue({ data: payload })
    const result = await getTodayHub(3)
    expect(api.get).toHaveBeenCalledWith('/portal/class-hub/today', { params: { classroom_id: 3 } })
    expect(result).toEqual(payload)
  })
})
