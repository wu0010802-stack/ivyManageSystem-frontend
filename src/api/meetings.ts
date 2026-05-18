import api from './index'

export const getMeetings = (params: unknown) => api.get('/meetings', { params })

export const getMeetingSummary = (params: unknown) => api.get('/meetings/summary', { params })

export const createBatch = (data: unknown) => api.post('/meetings/batch', data)

export const updateMeeting = (id: number, data: unknown) => api.put(`/meetings/${id}`, data)

export const deleteMeeting = (id: number) => api.delete(`/meetings/${id}`)
