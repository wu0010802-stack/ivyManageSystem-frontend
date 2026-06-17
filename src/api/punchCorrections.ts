import api from './index'

export const getCorrections = (params: unknown) => api.get('/punch-corrections', { params })

// payload: { approved: boolean, rejection_reason?: string }
export const approveCorrection = (id: number, payload: unknown) =>
  api.put(`/punch-corrections/${id}/approve`, payload)

// 批次審核
export const batchApproveCorrections = (ids: number[], approved: boolean, rejection_reason: string) =>
  api.post('/punch-corrections/batch-approve', { ids, approved, rejection_reason })
