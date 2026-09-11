import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/index', () => ({ default: { get: mockGet } }))

import { getTodayHub } from '@/api/portalClassHub'

describe('getTodayHub', () => {
  beforeEach(() => mockGet.mockClear())

  it('未帶 classroomId 時不送 params', async () => {
    await getTodayHub()
    expect(mockGet).toHaveBeenCalledWith('/portal/class-hub/today', { params: {} })
  })

  it('帶 classroomId 時送 classroom_id', async () => {
    await getTodayHub(7)
    expect(mockGet).toHaveBeenCalledWith('/portal/class-hub/today', {
      params: { classroom_id: 7 },
    })
  })
})
