/**
 * 家長端每日聯絡簿 API（v3.1 Phase 1）。
 *
 * 對應後端 api/parent_portal/contact_book.py。
 */

import api from './index'

export function getTodayContactBook(studentId: number, config: unknown = {}) {
  return api.get('/parent/contact-book/today', {
    params: { student_id: studentId },
    ...(config as object),
  })
}

export function listContactBook(
  studentId: number,
  { from, to, limit = 30 }: { from?: string; to?: string; limit?: number } = {},
  config: unknown = {},
) {
  return api.get('/parent/contact-book', {
    params: { student_id: studentId, from, to, limit },
    ...(config as object),
  })
}

export function getContactBookDetail(entryId: number) {
  return api.get(`/parent/contact-book/${entryId}`)
}

export function ackContactBook(entryId: number) {
  return api.post(`/parent/contact-book/${entryId}/ack`)
}

export function replyContactBook(entryId: number, body: unknown) {
  return api.post(`/parent/contact-book/${entryId}/reply`, { body })
}

export function deleteContactBookReply(entryId: number, replyId: number) {
  return api.delete(`/parent/contact-book/${entryId}/replies/${replyId}`)
}
