import api from './index'

export const getAnnouncements = (params) => api.get('/announcements', { params })

export const createAnnouncement = (data) => api.post('/announcements', data)

export const updateAnnouncement = (id, data) => api.put(`/announcements/${id}`, data)

export const deleteAnnouncement = (id) => api.delete(`/announcements/${id}`)
