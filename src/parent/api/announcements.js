import api from './index'

export const listAnnouncements = (params = {}) =>
  api.get('/parent/announcements', { params })

export const getUnreadCount = () =>
  api.get('/parent/announcements/unread-count')

export const markRead = (id) =>
  api.post(`/parent/announcements/${id}/read`)
