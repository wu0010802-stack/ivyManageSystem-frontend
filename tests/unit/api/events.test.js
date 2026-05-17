/**
 * tests/unit/api/events.test.js
 *
 * 驗證 src/api/events.js wrapper：HTTP method / URL / payload / 特殊選項（blob、multipart）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}))

import * as mod from '@/api/events'

describe('events api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('getEvents GET /events with params', async () => {
    await mod.getEvents({ year: 2026 })
    expect(mockGet).toHaveBeenCalledWith('/events', { params: { year: 2026 } })
  })

  it('getCalendarFeed GET /events/calendar-feed with params', async () => {
    await mod.getCalendarFeed({ token: 'xyz' })
    expect(mockGet).toHaveBeenCalledWith('/events/calendar-feed', { params: { token: 'xyz' } })
  })

  it('createEvent POST /events', async () => {
    const payload = { name: '校慶', date: '2026-05-17' }
    await mod.createEvent(payload)
    expect(mockPost).toHaveBeenCalledWith('/events', payload)
  })

  it('updateEvent PUT /events/:id', async () => {
    const payload = { name: '改名' }
    await mod.updateEvent(42, payload)
    expect(mockPut).toHaveBeenCalledWith('/events/42', payload)
  })

  it('deleteEvent DELETE /events/:id', async () => {
    await mod.deleteEvent(42)
    expect(mockDelete).toHaveBeenCalledWith('/events/42')
  })

  it('getHolidayImportTemplate GET /events/holidays/import-template with blob responseType', async () => {
    await mod.getHolidayImportTemplate()
    expect(mockGet).toHaveBeenCalledWith('/events/holidays/import-template', {
      responseType: 'blob',
    })
  })

  it('importHolidays POST /events/holidays/import with multipart headers', async () => {
    const fd = new FormData()
    await mod.importHolidays(fd)
    expect(mockPost).toHaveBeenCalledWith('/events/holidays/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })
})
