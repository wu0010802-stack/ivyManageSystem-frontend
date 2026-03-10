import api from './index'

export const getOvertimes = (params) => api.get('/overtimes', { params })

export const createOvertime = (data) => api.post('/overtimes', data)

export const updateOvertime = (id, data) => api.put(`/overtimes/${id}`, data)

export const approveOvertime = (id, approved) =>
  api.put(`/overtimes/${id}/approve?approved=${approved}`)

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
