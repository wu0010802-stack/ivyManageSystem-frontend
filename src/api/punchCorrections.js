import api from './index'

export const getCorrections = (params) => api.get('/punch-corrections', { params })

// payload: { approved: boolean, rejection_reason?: string }
export const approveCorrection = (id, payload) =>
  api.put(`/punch-corrections/${id}/approve`, payload)
