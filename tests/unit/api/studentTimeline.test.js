import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import { fetchTimeline, TIMELINE_SOURCE_TYPES } from '@/api/studentTimeline'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn() },
}))

describe('studentTimeline api', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('fetchTimeline hits /students/{id}/timeline with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await fetchTimeline(42, { source_type: 'observation', limit: 50 })
    expect(api.get).toHaveBeenCalledWith('/students/42/timeline', {
      params: { source_type: 'observation', limit: 50 },
    })
  })

  it('fetchTimeline defaults to empty params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await fetchTimeline(42)
    expect(api.get).toHaveBeenCalledWith('/students/42/timeline', { params: {} })
  })

  it('exports TIMELINE_SOURCE_TYPES with expected sources', () => {
    expect(Array.isArray(TIMELINE_SOURCE_TYPES)).toBe(true)
    const values = TIMELINE_SOURCE_TYPES.map((t) => t.value)
    expect(values).toEqual(
      expect.arrayContaining([
        'observation',
        'assessment',
        'incident',
        'communication',
        'contact_book',
        'attendance',
        'activity',
        'milestone',
        'measurement',
      ]),
    )
  })
})
