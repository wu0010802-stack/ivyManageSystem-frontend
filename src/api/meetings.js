import api from './index'

export const getMeetings = (params) => api.get('/meetings', { params })

export const getMeetingSummary = (params) => api.get('/meetings/summary', { params })

export const createBatch = (data) => api.post('/meetings/batch', data)

export const updateMeeting = (id, data) => api.put(`/meetings/${id}`, data)

export const deleteMeeting = (id) => api.delete(`/meetings/${id}`)
