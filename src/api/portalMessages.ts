/**
 * 教師端家長訊息 API（對應 api/portal/parent_messages.py）。
 *
 * 所有 endpoint 皆需 Permission.PARENT_MESSAGES_WRITE。
 */
import api from './index'

export function listThreads(params: unknown = {}) {
  return api.get('/portal/parent-messages/threads', { params })
}

export function getThread(threadId: number) {
  return api.get(`/portal/parent-messages/threads/${threadId}`)
}

export function listMessages(threadId: number, params: unknown = {}) {
  return api.get(`/portal/parent-messages/threads/${threadId}/messages`, { params })
}

export function createThread(payload: unknown) {
  return api.post('/portal/parent-messages/threads', payload)
}

export function postReply(threadId: number, payload: unknown) {
  return api.post(`/portal/parent-messages/threads/${threadId}/messages`, payload)
}

export function attachToMessage(threadId: number, messageId: number, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(
    `/portal/parent-messages/threads/${threadId}/messages/${messageId}/attach`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

export function markThreadRead(threadId: number) {
  return api.post(`/portal/parent-messages/threads/${threadId}/read`)
}

export function recallMessage(messageId: number) {
  return api.post(`/portal/parent-messages/messages/${messageId}/recall`)
}

export function getUnreadCount() {
  return api.get('/portal/parent-messages/unread-count')
}
