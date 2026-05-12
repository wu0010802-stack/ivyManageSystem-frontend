import api from './index'

export const listStudentAttachments = (studentId, params = {}) =>
  api.get(`/students/${studentId}/attachments`, { params })

export const OWNER_TYPE_LABELS = {
  observation: '觀察記錄',
  contact_book_entry: '聯絡簿',
  medication_order: '用藥單',
  report: '報告',
}
