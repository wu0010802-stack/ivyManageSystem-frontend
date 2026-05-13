import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import { listMilestones, createMilestone } from '@/api/portalMilestones'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

describe('portalMilestones', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('listMilestones hits /students/{id}/milestones', async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } })
    await listMilestones(42, { limit: 20 })
    expect(api.get).toHaveBeenCalledWith('/students/42/milestones', {
      params: { limit: 20 },
    })
  })

  it('createMilestone posts to /students/{id}/milestones', async () => {
    api.post.mockResolvedValue({ data: {} })
    const payload = {
      milestone_type: 'first_solo_event',
      achieved_on: '2026-05-13',
      title: '第一次自己穿鞋',
    }
    await createMilestone(42, payload)
    expect(api.post).toHaveBeenCalledWith('/students/42/milestones', payload)
  })
})
