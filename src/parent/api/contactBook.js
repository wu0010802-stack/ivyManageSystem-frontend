/**
 * 家長端每日聯絡簿 API（v3.1 Phase 1）。
 *
 * 對應後端 api/parent_portal/contact_book.py。
 */

import api from './index'

export function getTodayContactBook(studentId) {
  return api.get('/parent/contact-book/today', { params: { student_id: studentId } })
}

export function listContactBook(studentId, { from, to, limit = 30 } = {}) {
  return api.get('/parent/contact-book', {
    params: { student_id: studentId, from, to, limit },
  })
}

export function getContactBookDetail(entryId) {
  return api.get(`/parent/contact-book/${entryId}`)
}

export function ackContactBook(entryId) {
  return api.post(`/parent/contact-book/${entryId}/ack`)
}

export function replyContactBook(entryId, body) {
  return api.post(`/parent/contact-book/${entryId}/reply`, { body })
}

export function deleteContactBookReply(entryId, replyId) {
  return api.delete(`/parent/contact-book/${entryId}/replies/${replyId}`)
}
