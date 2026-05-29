import api from './index'

export const getAnnouncements = (params: unknown) => api.get('/announcements', { params })

export const createAnnouncement = (data: unknown) => api.post('/announcements', data)

export const updateAnnouncement = (id: number, data: unknown) => api.put(`/announcements/${id}`, data)

export const deleteAnnouncement = (id: number) => api.delete(`/announcements/${id}`)

// 對家長端發送對象（plan A.5）
// scope 支援：all / classroom / student / guardian
// payload: { recipients: [{ scope, classroom_id?, student_id?, guardian_id? }, ...] }
// 空 recipients 陣列 = 對家長端不顯示
export const getAnnouncementParentRecipients = (id: number) =>
  api.get(`/announcements/${id}/parent-recipients`)

export const replaceAnnouncementParentRecipients = (id: number, recipients: unknown) =>
  api.put(`/announcements/${id}/parent-recipients`, { recipients })

// Lazy fetch endpoints（PR #8 perf 改造）
// recipient_ids 改由此 endpoint 提供（list response 已移除此欄位）
export const getAnnouncementRecipients = (id: number) =>
  api.get(`/announcements/${id}/recipients`)

// readers 完整名單改 lazy fetch（list 只回 read_preview×3）
export const getAnnouncementReaders = (
  id: number,
  params: { page?: number; page_size?: number } = {},
) => api.get(`/announcements/${id}/readers`, { params })

// Attachment upload / delete（PR #2 附件支援）
export const uploadAnnouncementAttachment = (id: number, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/announcements/${id}/attachments`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const deleteAnnouncementAttachment = (id: number, attId: number) =>
  api.delete(`/announcements/${id}/attachments/${attId}`)
