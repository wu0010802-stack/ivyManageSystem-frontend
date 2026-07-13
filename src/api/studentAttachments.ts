import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

export const listStudentAttachments = (
  studentId: number,
  params: ApiQuery<'/students/{student_id}/attachments', 'get'> = {},
): AxiosResp<'/students/{student_id}/attachments', 'get'> =>
  api.get(`/students/${studentId}/attachments`, { params })

export const OWNER_TYPE_LABELS = {
  observation: '觀察記錄',
  contact_book_entry: '聯絡簿',
  medication_order: '用藥單',
  report: '報告',
}
