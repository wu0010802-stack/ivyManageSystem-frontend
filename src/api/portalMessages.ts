/**
 * 教師端家長訊息 API（對應 api/portal/parent_messages.py）。
 *
 * 所有 endpoint 皆需 Permission.PARENT_MESSAGES_WRITE。
 */
import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

export function listThreads(
  params: ApiQuery<'/portal/parent-messages/threads', 'get'> = {},
): AxiosResp<'/portal/parent-messages/threads', 'get'> {
  return api.get('/portal/parent-messages/threads', { params })
}

export function getThread(
  threadId: number,
): AxiosResp<'/portal/parent-messages/threads/{thread_id}', 'get'> {
  return api.get(`/portal/parent-messages/threads/${threadId}`)
}

export function listMessages(
  threadId: number,
  params: ApiQuery<'/portal/parent-messages/threads/{thread_id}/messages', 'get'> = {},
): AxiosResp<'/portal/parent-messages/threads/{thread_id}/messages', 'get'> {
  return api.get(`/portal/parent-messages/threads/${threadId}/messages`, { params })
}

export function createThread(
  payload: ApiBody<'/portal/parent-messages/threads', 'post'>,
): AxiosResp<'/portal/parent-messages/threads', 'post'> {
  return api.post('/portal/parent-messages/threads', payload)
}

export function postReply(
  threadId: number,
  payload: ApiBody<'/portal/parent-messages/threads/{thread_id}/messages', 'post'>,
): AxiosResp<'/portal/parent-messages/threads/{thread_id}/messages', 'post'> {
  return api.post(`/portal/parent-messages/threads/${threadId}/messages`, payload)
}

export function attachToMessage(
  threadId: number,
  messageId: number,
  file: File,
): AxiosResp<'/portal/parent-messages/threads/{thread_id}/messages/{message_id}/attach', 'post'> {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(
    `/portal/parent-messages/threads/${threadId}/messages/${messageId}/attach`,
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

export function markThreadRead(
  threadId: number,
): AxiosResp<'/portal/parent-messages/threads/{thread_id}/read', 'post'> {
  return api.post(`/portal/parent-messages/threads/${threadId}/read`)
}

export function recallMessage(
  messageId: number,
): AxiosResp<'/portal/parent-messages/messages/{message_id}/recall', 'post'> {
  return api.post(`/portal/parent-messages/messages/${messageId}/recall`)
}

export function getUnreadCount(): AxiosResp<'/portal/parent-messages/unread-count', 'get'> {
  return api.get('/portal/parent-messages/unread-count')
}
