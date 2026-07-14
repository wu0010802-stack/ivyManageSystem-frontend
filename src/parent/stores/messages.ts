/**
 * 家長端訊息 store（Phase 3）。
 *
 * 功能：
 * - thread 列表與快取
 * - thread 內訊息分頁載入（cursor）
 * - 樂觀送出（client_request_id 占位 → 伺服器 echo 後 reconcile）
 * - 未讀計數
 *
 * 不做 polling；ParentLayout 與 MessagesView 各自 onMounted/watch 觸發 fetch。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listMessageThreads,
  listThreadMessages,
  sendThreadMessage,
  attachToMessage,
  markThreadRead,
  recallMessage,
  getMessageUnreadCount,
} from '../api/messages'

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// 訊息 bucket（per thread）
interface MessageBucket {
  items: Record<string, unknown>[]
  next_cursor: string | null
  hasMore: boolean
}

export const useMessagesStore = defineStore('parentMessages', () => {
  const threads = ref<Record<string, unknown>[]>([])
  const threadsLoaded = ref(false)
  const messagesByThread = ref<Record<string, MessageBucket>>({}) // thread_id → { items: [], next_cursor, hasMore }
  const unreadCount = ref(0)
  let sessionVersion = 0

  async function fetchThreads(force = false) {
    if (threadsLoaded.value && !force) return
    const version = sessionVersion
    const { data } = await listMessageThreads({ limit: 30 })
    if (version !== sessionVersion) return
    threads.value = data?.items || []
    threadsLoaded.value = true
  }

  async function fetchMessages(threadId: number, { reset = false } = {}) {
    const version = sessionVersion
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
    const params: Record<string, unknown> = { limit: 30 }
    if (cur.next_cursor) params.cursor = cur.next_cursor
    const { data } = await listThreadMessages(threadId, params)
    if (version !== sessionVersion) return cur
    const newItems: Record<string, unknown>[] = data?.items || []
    // 後端回傳 desc（新→舊）；store 內部維持 desc 但 UI 渲染時會 reverse
    cur.items = [...cur.items, ...newItems]
    cur.next_cursor = data?.next_cursor || null
    cur.hasMore = !!data?.next_cursor
    messagesByThread.value = { ...messagesByThread.value, [threadId]: cur }
    return cur
  }

  /**
   * 樂觀送出。回傳 server-echo 的 message。
   * @param threadId number
   * @param body string
   * @param attachments File[]（可選）
   */
  async function send(threadId: number, body: string, attachments: File[] = []) {
    const version = sessionVersion
    const cri = uuid()
    // 樂觀占位
    const tempId = `tmp-${cri}`
    const placeholder: Record<string, unknown> = {
      id: tempId,
      thread_id: threadId,
      sender_role: 'parent',
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
      const { data } = await sendThreadMessage(threadId, {
        body,
        client_request_id: cri,
      })
      if (version !== sessionVersion) return data
      // 替換 placeholder
      cur.items = cur.items.map((m) => (m.id === tempId ? (data as Record<string, unknown>) : m))
      messagesByThread.value = { ...messagesByThread.value, [threadId]: cur }

      // 上傳附件（一次一檔）
      for (const f of attachments) {
        try {
          const serverMsg = data as Record<string, unknown>
          const { data: att } = await attachToMessage(threadId, serverMsg.id as number, f)
          if (version !== sessionVersion) return data
          // 把 attachment append 到該 message
          cur.items = cur.items.map((m) =>
            m.id === serverMsg.id
              ? { ...m, attachments: [...((m.attachments as unknown[]) || []), att] }
              : m,
          )
          messagesByThread.value = {
            ...messagesByThread.value,
            [threadId]: cur,
          }
        } catch {
          /* ignore single-file failure；UI 端可手動重試 */
        }
      }
      return data
    } catch (err) {
      // 失敗：移除 placeholder（讓使用者可重送）
      if (version === sessionVersion) {
        cur.items = cur.items.filter((m) => m.id !== tempId)
        messagesByThread.value = { ...messagesByThread.value, [threadId]: cur }
      }
      throw err
    }
  }

  async function markRead(threadId: number) {
    const version = sessionVersion
    await markThreadRead(threadId)
    if (version !== sessionVersion) return
    // 更新本地 thread.unread_count = 0
    threads.value = threads.value.map((t) =>
      t.id === threadId ? { ...t, unread_count: 0 } : t,
    )
    await refreshUnread()
  }

  async function recall(messageId: number) {
    const version = sessionVersion
    await recallMessage(messageId)
    if (version !== sessionVersion) return
    // 把所有 thread 內對應 id 的 message 標 deleted
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
    const version = sessionVersion
    try {
      const { data } = await getMessageUnreadCount()
      if (version !== sessionVersion) return
      unreadCount.value = (data as Record<string, unknown>)?.unread_count as number || 0
    } catch {
      /* ignore */
    }
  }

  function invalidate() {
    sessionVersion += 1
    threads.value = []
    threadsLoaded.value = false
    messagesByThread.value = {}
    unreadCount.value = 0
  }

  const clear = invalidate

  return {
    threads,
    threadsLoaded,
    messagesByThread,
    unreadCount,
    fetchThreads,
    fetchMessages,
    send,
    markRead,
    recall,
    refreshUnread,
    invalidate,
    clear,
  }
})
