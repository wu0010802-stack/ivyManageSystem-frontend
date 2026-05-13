import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  listMeasurements,
  createMeasurement,
  getMeasurementsLatest,
} from '@/api/portalMeasurements'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

describe('portalMeasurements', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('listMeasurements hits /students/{id}/measurements', async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } })
    await listMeasurements(42, { limit: 10 })
    expect(api.get).toHaveBeenCalledWith('/students/42/measurements', {
      params: { limit: 10 },
    })
  })

  it('createMeasurement posts to /students/{id}/measurements', async () => {
    api.post.mockResolvedValue({ data: {} })
    const payload = { measured_on: '2026-05-13', height_cm: '108.5' }
    await createMeasurement(42, payload)
    expect(api.post).toHaveBeenCalledWith('/students/42/measurements', payload)
  })

  it('getMeasurementsLatest hits /portal/students/measurements-latest', async () => {
    api.get.mockResolvedValue({ data: [] })
    await getMeasurementsLatest()
    expect(api.get).toHaveBeenCalledWith('/portal/students/measurements-latest')
  })
})
