import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  listObservations,
  createObservation,
  updateObservation,
  deleteObservation,
  uploadAttachment,
  deleteAttachment,
} from '@/api/portfolio'

vi.mock('@/api/index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('portfolio api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    api.delete.mockReset()
  })

  it('listObservations hits /students/{id}/observations with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listObservations(42, { limit: 10, offset: 0 })
    expect(api.get).toHaveBeenCalledWith('/students/42/observations', {
      params: { limit: 10, offset: 0 },
    })
  })

  it('listObservations defaults to empty params object', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listObservations(42)
    expect(api.get).toHaveBeenCalledWith('/students/42/observations', {
      params: {},
    })
  })

  it('createObservation posts payload to /students/{id}/observations', async () => {
    api.post.mockResolvedValue({ data: { id: 7 } })
    const payload = { content: '今天表現很好', observed_on: '2026-05-17' }
    await createObservation(42, payload)
    expect(api.post).toHaveBeenCalledWith('/students/42/observations', payload)
  })

  it('updateObservation patches /students/{id}/observations/{obsId}', async () => {
    api.patch.mockResolvedValue({ data: {} })
    const payload = { content: '更新後' }
    await updateObservation(42, 99, payload)
    expect(api.patch).toHaveBeenCalledWith('/students/42/observations/99', payload)
  })

  it('deleteObservation deletes /students/{id}/observations/{obsId}', async () => {
    api.delete.mockResolvedValue({ data: {} })
    await deleteObservation(42, 99)
    expect(api.delete).toHaveBeenCalledWith('/students/42/observations/99')
  })

  it('uploadAttachment posts multipart FormData to /attachments', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } })
    const file = new Blob(['hello'], { type: 'text/plain' })
    const onUploadProgress = vi.fn()
    await uploadAttachment(file, 'observation', 99, { onUploadProgress })

    expect(api.post).toHaveBeenCalledTimes(1)
    const [url, body, options] = api.post.mock.calls[0]
    expect(url).toBe('/attachments')
    expect(body).toBeInstanceOf(FormData)
    expect(body.has('file')).toBe(true)
    expect(body.get('owner_type')).toBe('observation')
    expect(body.get('owner_id')).toBe('99')
    expect(options.headers).toEqual({ 'Content-Type': 'multipart/form-data' })
    expect(options.onUploadProgress).toBe(onUploadProgress)
  })

  it('uploadAttachment works without options', async () => {
    api.post.mockResolvedValue({ data: {} })
    const file = new Blob(['x'], { type: 'text/plain' })
    await uploadAttachment(file, 'report', 42)

    const [, , options] = api.post.mock.calls[0]
    expect(options.headers).toEqual({ 'Content-Type': 'multipart/form-data' })
    expect(options.onUploadProgress).toBeUndefined()
  })

  it('deleteAttachment deletes /attachments/{id}', async () => {
    api.delete.mockResolvedValue({ data: {} })
    await deleteAttachment(99)
    expect(api.delete).toHaveBeenCalledWith('/attachments/99')
  })
})
