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
  work_sample: '作品集',
  class_album: '班級相簿',
}

/**
 * 照片牆上可刪除（班級相簿為「移除」）的來源。用藥單照片是給藥依據、報告照片
 * 隨報告發布，後端一律 403（ivy-backend utils/portfolio_access.py
 * MODIFIABLE_ATTACHMENT_OWNER_TYPES，class_album 由照片牆端點改走解除標記）。
 * 用白名單而非黑名單：日後新增來源時預設不給刪，與後端同為 fail-closed。
 */
const WALL_DELETABLE_OWNER_TYPES: ReadonlySet<string> = new Set([
  'observation',
  'contact_book_entry',
  'work_sample',
  'class_album',
])

export const isWallDeletable = (ownerType: unknown): boolean =>
  typeof ownerType === 'string' && WALL_DELETABLE_OWNER_TYPES.has(ownerType)

/**
 * 從該生照片牆刪除一張照片。
 * 觀察／聯絡簿／作品軟刪附件本體；班級相簿照片只解除該生標記（照片與他生標記保留）；
 * 用藥單／報告不可刪（403），呼叫端以 isWallDeletable 隱藏刪除鈕。
 */
export const deleteStudentAttachment = (
  studentId: number,
  attachmentId: number,
): AxiosResp<'/students/{student_id}/attachments/{attachment_id}', 'delete'> =>
  api.delete(`/students/${studentId}/attachments/${attachmentId}`)
