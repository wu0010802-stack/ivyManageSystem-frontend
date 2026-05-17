import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api/index'
import {
  listThreads,
  getThread,
  listMessages,
  createThread,
  postReply,
  attachToMessage,
  markThreadRead,
  recallMessage,
  getUnreadCount,
} from '@/api/portalMessages'

vi.mock('@/api/index', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

describe('portalMessages api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('listThreads hits /portal/parent-messages/threads with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listThreads({ status: 'open', limit: 20 })
    expect(api.get).toHaveBeenCalledWith('/portal/parent-messages/threads', {
      params: { status: 'open', limit: 20 },
    })
  })

  it('listThreads defaults to empty params object', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listThreads()
    expect(api.get).toHaveBeenCalledWith('/portal/parent-messages/threads', { params: {} })
  })

  it('getThread hits /portal/parent-messages/threads/{id}', async () => {
    api.get.mockResolvedValue({ data: {} })
    await getThread(42)
    expect(api.get).toHaveBeenCalledWith('/portal/parent-messages/threads/42')
  })

  it('listMessages hits /portal/parent-messages/threads/{id}/messages with params', async () => {
    api.get.mockResolvedValue({ data: [] })
    await listMessages(42, { after_id: 100 })
    expect(api.get).toHaveBeenCalledWith('/portal/parent-messages/threads/42/messages', {
      params: { after_id: 100 },
    })
  })

  it('createThread posts to /portal/parent-messages/threads', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } })
    const payload = { student_id: 5, subject: '請假', body: '今天身體不適' }
    await createThread(payload)
    expect(api.post).toHaveBeenCalledWith('/portal/parent-messages/threads', payload)
  })

  it('postReply posts to /portal/parent-messages/threads/{id}/messages', async () => {
    api.post.mockResolvedValue({ data: { id: 1 } })
    const payload = { body: '收到了' }
    await postReply(42, payload)
    expect(api.post).toHaveBeenCalledWith(
      '/portal/parent-messages/threads/42/messages',
      payload,
    )
  })

  it('attachToMessage posts multipart/form-data with file', async () => {
    api.post.mockResolvedValue({ data: {} })
    const fakeFile = new Blob(['hello'], { type: 'text/plain' })
    await attachToMessage(42, 99, fakeFile)
    expect(api.post).toHaveBeenCalledTimes(1)
    const [url, fd, opts] = api.post.mock.calls[0]
    expect(url).toBe('/portal/parent-messages/threads/42/messages/99/attach')
    expect(fd).toBeInstanceOf(FormData)
    const attached = fd.get('file')
    expect(attached).toBeInstanceOf(Blob)
    expect(attached.type).toBe('text/plain')
    expect(opts).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
  })

  it('markThreadRead posts to /portal/parent-messages/threads/{id}/read', async () => {
    api.post.mockResolvedValue({ data: {} })
    await markThreadRead(42)
    expect(api.post).toHaveBeenCalledWith('/portal/parent-messages/threads/42/read')
  })

  it('recallMessage posts to /portal/parent-messages/messages/{id}/recall', async () => {
    api.post.mockResolvedValue({ data: {} })
    await recallMessage(123)
    expect(api.post).toHaveBeenCalledWith('/portal/parent-messages/messages/123/recall')
  })

  it('getUnreadCount hits /portal/parent-messages/unread-count', async () => {
    api.get.mockResolvedValue({ data: { count: 3 } })
    await getUnreadCount()
    expect(api.get).toHaveBeenCalledWith('/portal/parent-messages/unread-count')
  })
})
