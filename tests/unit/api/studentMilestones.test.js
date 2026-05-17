import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  listMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  autoDetectMilestones,
  MILESTONE_TYPES,
} from '@/api/studentMilestones'

vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('studentMilestones api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    api.delete.mockReset()
  })

  it('listMilestones hits /students/{id}/milestones with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listMilestones(42, { limit: 20 })
    expect(api.get).toHaveBeenCalledWith('/students/42/milestones', {
      params: { limit: 20 },
    })
  })

  it('listMilestones defaults to empty params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listMilestones(42)
    expect(api.get).toHaveBeenCalledWith('/students/42/milestones', { params: {} })
  })

  it('createMilestone posts payload to /students/{id}/milestones', async () => {
    api.post.mockResolvedValue({ data: {} })
    const payload = {
      milestone_type: 'first_solo_event',
      achieved_on: '2026-05-17',
      title: '第一次自己穿鞋',
    }
    await createMilestone(42, payload)
    expect(api.post).toHaveBeenCalledWith('/students/42/milestones', payload)
  })

  it('updateMilestone patches /students/{sid}/milestones/{id}', async () => {
    api.patch.mockResolvedValue({ data: {} })
    const payload = { title: '更新' }
    await updateMilestone(42, 99, payload)
    expect(api.patch).toHaveBeenCalledWith('/students/42/milestones/99', payload)
  })

  it('deleteMilestone deletes /students/{sid}/milestones/{id}', async () => {
    api.delete.mockResolvedValue({ data: {} })
    await deleteMilestone(42, 99)
    expect(api.delete).toHaveBeenCalledWith('/students/42/milestones/99')
  })

  it('autoDetectMilestones posts to /students/{id}/milestones/auto-detect', async () => {
    api.post.mockResolvedValue({ data: { detected: 3 } })
    const payload = { since: '2026-01-01' }
    await autoDetectMilestones(42, payload)
    expect(api.post).toHaveBeenCalledWith(
      '/students/42/milestones/auto-detect',
      payload,
    )
  })

  it('autoDetectMilestones defaults to empty payload', async () => {
    api.post.mockResolvedValue({ data: {} })
    await autoDetectMilestones(42)
    expect(api.post).toHaveBeenCalledWith(
      '/students/42/milestones/auto-detect',
      {},
    )
  })

  it('exports MILESTONE_TYPES with expected values', () => {
    expect(Array.isArray(MILESTONE_TYPES)).toBe(true)
    const values = MILESTONE_TYPES.map((m) => m.value)
    expect(values).toContain('birthday')
    expect(values).toContain('graduation')
    expect(values).toContain('custom')
  })
})
