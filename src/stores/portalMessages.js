/**
 * 教師端家長訊息 store。
 *
 * 仿 src/parent/stores/messages.js 設計：thread 列表 + cursor 分頁 + 樂觀送出 + 撤回。
 * sender_role 為 'teacher'。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
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

export const usePortalMessagesStore = defineStore('portalMessages', () => {
  const threads = ref([])
  const threadsLoaded = ref(false)
  const messagesByThread = ref({}) // thread_id → { items, next_cursor, hasMore }
  const unreadCount = ref(0)

  async function fetchThreads(force = false) {
    if (threadsLoaded.value && !force) return
    const { data } = await listThreads({ limit: 30 })
    threads.value = data?.items || []
    threadsLoaded.value = true
  }

  async function fetchMessages(threadId, { reset = false } = {}) {
    const cur = messagesByThread.value[threadId] || {
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
    const params = { limit: 30 }
    if (cur.next_cursor) params.cursor = cur.next_cursor
    const { data } = await listMessages(threadId, params)
    const newItems = data?.items || []
    cur.items = [...cur.items, ...newItems]
    cur.next_cursor = data?.next_cursor || null
    cur.hasMore = !!data?.next_cursor
    messagesByThread.value = { ...messagesByThread.value, [threadId]: cur }
    return cur
  }

  /**
   * 教師回覆既有 thread。樂觀送出。
   */
  async function send(threadId, body, attachments = []) {
    const cri = uuid()
    const tempId = `tmp-${cri}`
    const placeholder = {
      id: tempId,
      thread_id: threadId,
      sender_role: 'teacher',
      body,
      deleted: false,
      attachments: [],
      created_at: new Date().toISOString(),
      _pending: true,
    }
    const cur = messagesByThread.value[threadId] || {
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
              ? { ...m, attachments: [...(m.attachments || []), att] }
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
  async function startThread({ studentId, parentUserId, body }) {
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

  async function markRead(threadId) {
    await markThreadRead(threadId)
    threads.value = threads.value.map((t) =>
      t.id === threadId ? { ...t, unread_count: 0 } : t,
    )
    await refreshUnread()
  }

  async function recall(messageId) {
    await recallMessage(messageId)
    const updated = {}
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
      unreadCount.value = data?.unread_count || 0
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
