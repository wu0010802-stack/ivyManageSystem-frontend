import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/portalMessages', () => ({
  listThreads: vi.fn(),
  listMessages: vi.fn(),
  postReply: vi.fn(),
  createThread: vi.fn(),
  attachToMessage: vi.fn(),
  markThreadRead: vi.fn(),
  recallMessage: vi.fn(),
  getUnreadCount: vi.fn(),
}))

import {
  listThreads,
  listMessages,
  postReply,
  createThread,
  markThreadRead,
  recallMessage,
  getUnreadCount,
} from '@/api/portalMessages'
import { usePortalMessagesStore } from '@/stores/portalMessages'

describe('usePortalMessagesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchThreads caches result; second call without force is no-op', async () => {
    listThreads.mockResolvedValue({ data: { items: [{ id: 1 }] } })
    const store = usePortalMessagesStore()
    await store.fetchThreads()
    await store.fetchThreads() // no-op
    expect(listThreads).toHaveBeenCalledTimes(1)
    expect(store.threads).toEqual([{ id: 1 }])
  })

  it('fetchThreads with force=true re-fetches', async () => {
    listThreads.mockResolvedValue({ data: { items: [] } })
    const store = usePortalMessagesStore()
    await store.fetchThreads()
    await store.fetchThreads(true)
    expect(listThreads).toHaveBeenCalledTimes(2)
  })

  it('send adds optimistic placeholder, then reconciles with server message', async () => {
    postReply.mockResolvedValue({
      data: {
        id: 100,
        thread_id: 1,
        sender_role: 'teacher',
        body: 'hi',
        attachments: [],
      },
    })
    const store = usePortalMessagesStore()
    const promise = store.send(1, 'hi')
    // 立即有 placeholder
    const tBefore = store.messagesByThread[1]
    expect(tBefore.items.length).toBe(1)
    expect(tBefore.items[0]._pending).toBe(true)

    const final = await promise
    expect(final.id).toBe(100)
    const tAfter = store.messagesByThread[1]
    expect(tAfter.items.length).toBe(1)
    expect(tAfter.items[0].id).toBe(100)
    expect(tAfter.items[0]._pending).toBeUndefined()
  })

  it('send removes placeholder on failure', async () => {
    postReply.mockRejectedValue(new Error('boom'))
    const store = usePortalMessagesStore()
    await expect(store.send(1, 'hi')).rejects.toThrow('boom')
    const cur = store.messagesByThread[1]
    expect(cur.items).toEqual([])
  })

  it('recall marks message deleted across all threads', async () => {
    recallMessage.mockResolvedValue({ data: { status: 'ok' } })
    const store = usePortalMessagesStore()
    // 注入兩個 thread 的訊息
    store.messagesByThread = {
      1: {
        items: [
          { id: 10, body: 'a', deleted: false },
          { id: 11, body: 'b', deleted: false },
        ],
      },
      2: {
        items: [{ id: 10, body: 'c', deleted: false }],
      },
    }
    await store.recall(10)
    expect(store.messagesByThread[1].items[0].deleted).toBe(true)
    expect(store.messagesByThread[1].items[0].body).toBeNull()
    expect(store.messagesByThread[1].items[1].deleted).toBe(false)
    expect(store.messagesByThread[2].items[0].deleted).toBe(true)
  })

  it('markRead resets thread unread + refreshes count', async () => {
    markThreadRead.mockResolvedValue({ data: {} })
    getUnreadCount.mockResolvedValue({ data: { unread_count: 0 } })
    const store = usePortalMessagesStore()
    store.threads = [
      { id: 1, unread_count: 3 },
      { id: 2, unread_count: 1 },
    ]
    await store.markRead(1)
    expect(store.threads.find((t) => t.id === 1).unread_count).toBe(0)
    expect(store.threads.find((t) => t.id === 2).unread_count).toBe(1)
    expect(store.unreadCount).toBe(0)
  })

  it('startThread prepends new thread to list', async () => {
    createThread.mockResolvedValue({
      data: {
        thread: { id: 99, student_id: 5, last_message_preview: 'hi' },
        message: { id: 1, body: 'hi' },
      },
    })
    const store = usePortalMessagesStore()
    store.threads = [{ id: 50 }]
    const out = await store.startThread({
      studentId: 5,
      parentUserId: 7,
      body: 'hi',
    })
    expect(out.thread.id).toBe(99)
    expect(store.threads[0].id).toBe(99)
    expect(store.threads.length).toBe(2)
  })

  it('fetchMessages appends in cursor order', async () => {
    listMessages
      .mockResolvedValueOnce({
        data: { items: [{ id: 10 }, { id: 9 }], next_cursor: 9 },
      })
      .mockResolvedValueOnce({
        data: { items: [{ id: 8 }], next_cursor: null },
      })
    const store = usePortalMessagesStore()
    await store.fetchMessages(1)
    expect(store.messagesByThread[1].items).toEqual([{ id: 10 }, { id: 9 }])
    expect(store.messagesByThread[1].hasMore).toBe(true)
    await store.fetchMessages(1)
    expect(store.messagesByThread[1].items.map((m) => m.id)).toEqual([
      10, 9, 8,
    ])
    expect(store.messagesByThread[1].hasMore).toBe(false)
  })
})
