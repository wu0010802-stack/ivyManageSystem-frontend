/**
 * 教師端家長訊息 API（對應 api/portal/parent_messages.py）。
 *
 * 所有 endpoint 皆需 Permission.PARENT_MESSAGES_WRITE。
 */
import api from './index'

export function listThreads(params = {}) {
  return api.get('/portal/parent-messages/threads', { params })
}

export function getThread(threadId) {
  return api.get(`/portal/parent-messages/threads/${threadId}`)
}

export function listMessages(threadId, params = {}) {
  return api.get(`/portal/parent-messages/threads/${threadId}/messages`, { params })
}

export function createThread(payload) {
  return api.post('/portal/parent-messages/threads', payload)
}

export function postReply(threadId, payload) {
  return api.post(`/portal/parent-messages/threads/${threadId}/messages`, payload)
}

export function attachToMessage(threadId, messageId, file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(
    `/portal/parent-messages/threads/${threadId}/messages/${messageId}/attach`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

export function markThreadRead(threadId) {
  return api.post(`/portal/parent-messages/threads/${threadId}/read`)
}

export function recallMessage(messageId) {
  return api.post(`/portal/parent-messages/messages/${messageId}/recall`)
}

export function getUnreadCount() {
  return api.get('/portal/parent-messages/unread-count')
}
