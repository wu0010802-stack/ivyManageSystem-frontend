import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  listMeasurements,
  createMeasurement,
  updateMeasurement,
  deleteMeasurement,
  fetchMeasurementChart,
} from '@/api/studentMeasurements'

vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('studentMeasurements api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    api.delete.mockReset()
  })

  it('listMeasurements hits /students/{id}/measurements with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listMeasurements(42, { limit: 10 })
    expect(api.get).toHaveBeenCalledWith('/students/42/measurements', {
      params: { limit: 10 },
    })
  })

  it('listMeasurements defaults to empty params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listMeasurements(42)
    expect(api.get).toHaveBeenCalledWith('/students/42/measurements', { params: {} })
  })

  it('createMeasurement posts payload to /students/{id}/measurements', async () => {
    api.post.mockResolvedValue({ data: {} })
    const payload = { measured_on: '2026-05-17', height_cm: 110, weight_kg: 18 }
    await createMeasurement(42, payload)
    expect(api.post).toHaveBeenCalledWith('/students/42/measurements', payload)
  })

  it('updateMeasurement patches /students/{sid}/measurements/{id}', async () => {
    api.patch.mockResolvedValue({ data: {} })
    const payload = { height_cm: 111 }
    await updateMeasurement(42, 99, payload)
    expect(api.patch).toHaveBeenCalledWith('/students/42/measurements/99', payload)
  })

  it('deleteMeasurement deletes /students/{sid}/measurements/{id}', async () => {
    api.delete.mockResolvedValue({ data: {} })
    await deleteMeasurement(42, 99)
    expect(api.delete).toHaveBeenCalledWith('/students/42/measurements/99')
  })

  it('fetchMeasurementChart hits /students/{id}/measurements/chart-data with params', async () => {
    api.get.mockResolvedValue({ data: { series: [] } })
    await fetchMeasurementChart(42, { metric: 'height_cm' })
    expect(api.get).toHaveBeenCalledWith('/students/42/measurements/chart-data', {
      params: { metric: 'height_cm' },
    })
  })

  it('fetchMeasurementChart defaults to empty params', async () => {
    api.get.mockResolvedValue({ data: {} })
    await fetchMeasurementChart(42)
    expect(api.get).toHaveBeenCalledWith('/students/42/measurements/chart-data', {
      params: {},
    })
  })
})
