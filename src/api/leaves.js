import api from './index'

export const getLeaves = (params) => api.get('/leaves', { params })

export const createLeave = (data) => api.post('/leaves', data)

export const updateLeave = (id, data) => api.put(`/leaves/${id}`, data)

// payload: { approved: boolean, rejection_reason?: string }
export const approveLeave = (id, payload) => api.put(`/leaves/${id}/approve`, payload)

export const getLeaveAttachment = (leaveId, filename) =>
  api.get(`/leaves/${leaveId}/attachments/${filename}`, { responseType: 'blob' })

export const uploadLeaveAttachments = (leaveId, formData) =>
  api.post(`/leaves/${leaveId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const getLeaveQuotas = (params) => api.get('/leaves/quotas', { params })

export const updateLeaveQuota = (id, data) => api.put(`/leaves/quotas/${id}`, data)

// null body，透過 query params 送出
export const initLeaveQuotas = (params) =>
  api.post('/leaves/quotas/init', null, { params })

export const getWorkdayHours = (params) => api.get('/leaves/workday-hours', { params })
