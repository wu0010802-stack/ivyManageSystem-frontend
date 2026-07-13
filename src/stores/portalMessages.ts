/**
 * 教師端家長訊息 store。
 *
 * 仿 src/parent/stores/messages.ts 設計：thread 列表 + cursor 分頁 + 樂觀送出 + 撤回。
 * sender_role 為 'teacher'。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ApiQuery, ApiResponse } from '@/api/_generated/typed'
import {
  listThreads,
  listMessages,
  postReply,
  createThread,
  attachToMessage,
  markThreadRead,
  recallMessage,
  getUnreadCount,
} from '../api/portalMessages'

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

type ThreadSummary = ApiResponse<'/portal/parent-messages/threads', 'get'>['items'][number]
type PortalMessage = ApiResponse<
  '/portal/parent-messages/threads/{thread_id}/messages',
  'get'
>['items'][number]

/**
 * 樂觀送出的訊息在伺服器確認前只有本地欄位（暫時字串 id、缺 sender_user_id/source，
 * 這些由伺服器指派），故本地 bucket 型別放寬：id 允許暫時字串、sender_user_id/source
 * 改為 optional；額外的 `_pending` 旗標標記尚未送出成功的樂觀項目。
 */
type MessageItem = Omit<PortalMessage, 'id' | 'sender_user_id' | 'source'> & {
  id: number | string
  sender_user_id?: number
  source?: string
  _pending?: boolean
}

// 訊息 bucket（per thread）
interface MessageBucket {
  items: MessageItem[]
  next_cursor: number | null
  hasMore: boolean
}

export const usePortalMessagesStore = defineStore('portalMessages', () => {
  const threads = ref<ThreadSummary[]>([])
  const threadsLoaded = ref(false)
  const messagesByThread = ref<Record<string, MessageBucket>>({}) // thread_id → { items, next_cursor, hasMore }
  const unreadCount = ref(0)

  async function fetchThreads(force = false) {
    if (threadsLoaded.value && !force) return
    const { data } = await listThreads({ limit: 30 })
    threads.value = data.items
    threadsLoaded.value = true
  }

  async function fetchMessages(threadId: number, { reset = false } = {}) {
    const cur: MessageBucket = messagesByThread.value[threadId] || {
      items: [],
      next_cursor: null,
      hasMore: true,
    }
    if (reset) {
      cur.items = []
      cur.next_cursor = null
      cur.hasMore = true
    }
    if (!cur.hasMore && !reset) return cur
    const params: ApiQuery<'/portal/parent-messages/threads/{thread_id}/messages', 'get'> = {
      limit: 30,
    }
    if (cur.next_cursor) params.cursor = cur.next_cursor
    const { data } = await listMessages(threadId, params)
    const newItems: MessageItem[] = data.items
    cur.items = [...cur.items, ...newItems]
    cur.next_cursor = data.next_cursor ?? null
    cur.hasMore = !!data.next_cursor
    messagesByThread.value = { ...messagesByThread.value, [threadId]: cur }
    return cur
  }

  /**
   * 教師回覆既有 thread。樂觀送出。
   */
  async function send(threadId: number, body: string, attachments: File[] = []) {
    const cri = uuid()
    const tempId = `tmp-${cri}`
    const placeholder: MessageItem = {
      id: tempId,
      thread_id: threadId,
      sender_role: 'teacher',
      body,
      deleted: false,
      attachments: [],
      created_at: new Date().toISOString(),
      _pending: true,
    }
    const cur: MessageBucket = messagesByThread.value[threadId] || {
      items: [],
      next_cursor: null,
      hasMore: false,
    }
    cur.items = [placeholder, ...cur.items]
    messagesByThread.value = { ...messagesByThread.value, [threadId]: cur }

    try {
      const { data } = await postReply(threadId, {
        body,
        client_request_id: cri,
      })
      cur.items = cur.items.map((m) => (m.id === tempId ? data : m))
      messagesByThread.value = { ...messagesByThread.value, [threadId]: cur }

      for (const f of attachments) {
        try {
          const { data: att } = await attachToMessage(threadId, data.id, f)
          cur.items = cur.items.map((m) =>
            m.id === data.id
              ? { ...m, attachments: [...m.attachments, att] }
              : m,
          )
          messagesByThread.value = {
            ...messagesByThread.value,
            [threadId]: cur,
          }
        } catch {
          /* ignore single-file failure */
        }
      }
      return data
    } catch (err) {
      cur.items = cur.items.filter((m) => m.id !== tempId)
      messagesByThread.value = { ...messagesByThread.value, [threadId]: cur }
      throw err
    }
  }

  /**
   * 教師主動發起新 thread + 第一則訊息。
   */
  async function startThread({ studentId, parentUserId, body }: { studentId: number; parentUserId: number; body: string }) {
    const cri = uuid()
    const { data } = await createThread({
      student_id: studentId,
      parent_user_id: parentUserId,
      body,
      client_request_id: cri,
    })
    // 把新 thread 加到列表頂端
    threads.value = [data.thread, ...threads.value]
    return data
  }

  async function markRead(threadId: number) {
    await markThreadRead(threadId)
    threads.value = threads.value.map((t) =>
      t.id === threadId ? { ...t, unread_count: 0 } : t,
    )
    await refreshUnread()
  }

  async function recall(messageId: number) {
    await recallMessage(messageId)
    const updated: Record<string, MessageBucket> = {}
    for (const [tid, bucket] of Object.entries(messagesByThread.value)) {
      bucket.items = bucket.items.map((m) =>
        m.id === messageId ? { ...m, deleted: true, body: null } : m,
      )
      updated[tid] = bucket
    }
    messagesByThread.value = updated
  }

  async function refreshUnread() {
    try {
      const { data } = await getUnreadCount()
      unreadCount.value = data.unread_count || 0
    } catch {
      /* ignore */
    }
  }

  function invalidate() {
    threads.value = []
    threadsLoaded.value = false
    messagesByThread.value = {}
  }

  return {
    threads,
    threadsLoaded,
    messagesByThread,
    unreadCount,
    fetchThreads,
    fetchMessages,
    send,
    startThread,
    markRead,
    recall,
    refreshUnread,
    invalidate,
  }
})
