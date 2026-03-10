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

// 批次審核
export const batchApproveLeaves = (ids, approved, rejection_reason) =>
  api.post('/leaves/batch-approve', { ids, approved, rejection_reason })

// Excel 匯入
export const getLeaveImportTemplate = () =>
  api.get('/leaves/import-template', { responseType: 'blob' })

export const importLeaves = (formData) =>
  api.post('/leaves/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
