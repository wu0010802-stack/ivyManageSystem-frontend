import api from './index'

export const getAnnouncements = (params) => api.get('/announcements', { params })

export const createAnnouncement = (data) => api.post('/announcements', data)

export const updateAnnouncement = (id, data) => api.put(`/announcements/${id}`, data)

export const deleteAnnouncement = (id) => api.delete(`/announcements/${id}`)

// 對家長端發送對象（plan A.5）
// scope 支援：all / classroom / student / guardian
// payload: { recipients: [{ scope, classroom_id?, student_id?, guardian_id? }, ...] }
// 空 recipients 陣列 = 對家長端不顯示
export const getAnnouncementParentRecipients = (id) =>
  api.get(`/announcements/${id}/parent-recipients`)

export const replaceAnnouncementParentRecipients = (id, recipients) =>
  api.put(`/announcements/${id}/parent-recipients`, { recipients })
