import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  listToday,
  administer,
  skipLog,
  correctLog,
} from '@/api/portalMedications'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

describe('portalMedications api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('listToday hits /portal/medications/today with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listToday({ classroom_id: 7 })
    expect(api.get).toHaveBeenCalledWith('/portal/medications/today', {
      params: { classroom_id: 7 },
    })
  })

  it('listToday defaults to empty params object', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listToday()
    expect(api.get).toHaveBeenCalledWith('/portal/medications/today', { params: {} })
  })

  it('administer posts to /medication-logs/{id}/administer', async () => {
    api.post.mockResolvedValue({ data: {} })
    const payload = { dose_taken: '5ml', note: '吃完早餐後' }
    await administer(42, payload)
    expect(api.post).toHaveBeenCalledWith('/medication-logs/42/administer', payload)
  })

  it('administer defaults payload to empty object', async () => {
    api.post.mockResolvedValue({ data: {} })
    await administer(42)
    expect(api.post).toHaveBeenCalledWith('/medication-logs/42/administer', {})
  })

  it('skipLog posts to /medication-logs/{id}/skip with payload', async () => {
    api.post.mockResolvedValue({ data: {} })
    const payload = { reason: '家長取消' }
    await skipLog(99, payload)
    expect(api.post).toHaveBeenCalledWith('/medication-logs/99/skip', payload)
  })

  it('correctLog posts to /medication-logs/{id}/correct with payload', async () => {
    api.post.mockResolvedValue({ data: {} })
    const payload = { dose_taken: '3ml', note: '修正紀錄' }
    await correctLog(99, payload)
    expect(api.post).toHaveBeenCalledWith('/medication-logs/99/correct', payload)
  })
})
