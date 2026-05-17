import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  listObservations,
  createObservation,
  updateObservation,
  deleteObservation,
} from '@/api/portalObservations'

vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('portalObservations api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    api.delete.mockReset()
  })

  it('listObservations hits /students/{id}/observations with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listObservations(42, { tag: 'dev' })
    expect(api.get).toHaveBeenCalledWith('/students/42/observations', {
      params: { tag: 'dev' },
    })
  })

  it('listObservations defaults to empty params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listObservations(42)
    expect(api.get).toHaveBeenCalledWith('/students/42/observations', { params: {} })
  })

  it('createObservation posts payload to /students/{id}/observations', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } })
    const payload = { content: '今天樂於分享', observed_on: '2026-05-17' }
    await createObservation(42, payload)
    expect(api.post).toHaveBeenCalledWith('/students/42/observations', payload)
  })

  it('updateObservation patches /students/{sid}/observations/{obsId}', async () => {
    api.patch.mockResolvedValue({ data: {} })
    const payload = { content: '修正內容' }
    await updateObservation(42, 99, payload)
    expect(api.patch).toHaveBeenCalledWith('/students/42/observations/99', payload)
  })

  it('deleteObservation deletes /students/{sid}/observations/{obsId}', async () => {
    api.delete.mockResolvedValue({ data: {} })
    await deleteObservation(42, 99)
    expect(api.delete).toHaveBeenCalledWith('/students/42/observations/99')
  })
})
