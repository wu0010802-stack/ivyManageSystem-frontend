import api from './index'

export const getOvertimes = (params) => api.get('/overtimes', { params })

export const createOvertime = (data) => api.post('/overtimes', data)

export const updateOvertime = (id, data) => api.put(`/overtimes/${id}`, data)

// payload: { approved: boolean, rejection_reason?: string }
// 駁回必須帶 rejection_reason（後端要求 trim 後 ≥3 字，2026-05-07 安全強化）
export const approveOvertime = (id, payload) =>
  api.put(`/overtimes/${id}/approve`, payload)

// 批次審核
export const batchApproveOvertimes = (ids, approved, rejection_reason) =>
  api.post('/overtimes/batch-approve', { ids, approved, rejection_reason })

// Excel 匯入
export const getOvertimeImportTemplate = () =>
  api.get('/overtimes/import-template', { responseType: 'blob' })

export const importOvertimes = (formData) =>
  api.post('/overtimes/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
