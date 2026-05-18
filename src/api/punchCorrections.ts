import api from './index'

export const getCorrections = (params: unknown) => api.get('/punch-corrections', { params })

// payload: { approved: boolean, rejection_reason?: string }
export const approveCorrection = (id: number, payload: unknown) =>
  api.put(`/punch-corrections/${id}/approve`, payload)
