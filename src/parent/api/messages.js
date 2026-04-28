/**
 * 家園溝通平台 — 家長端訊息 API（Phase 3）。
 * 對應 api/parent_portal/messages.py。
 */

import api from './index'

export function listMessageThreads(params = {}) {
  return api.get('/parent/messages/threads', { params })
}

export function getMessageThread(threadId) {
  return api.get(`/parent/messages/threads/${threadId}`)
}

export function listThreadMessages(threadId, params = {}) {
  return api.get(`/parent/messages/threads/${threadId}/messages`, { params })
}

export function sendThreadMessage(threadId, payload) {
  return api.post(`/parent/messages/threads/${threadId}/messages`, payload)
}

export function attachToMessage(threadId, messageId, file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(
    `/parent/messages/threads/${threadId}/messages/${messageId}/attach`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

export function markThreadRead(threadId) {
  return api.post(`/parent/messages/threads/${threadId}/read`)
}

export function recallMessage(messageId) {
  return api.post(`/parent/messages/messages/${messageId}/recall`)
}

export function getMessageUnreadCount() {
  return api.get('/parent/messages/unread-count')
}
