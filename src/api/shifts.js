import api from './index'

export const getShiftTypes = () => api.get('/shifts/types')

export const createShiftType = (data) => api.post('/shifts/types', data)

export const updateShiftType = (id, data) => api.put(`/shifts/types/${id}`, data)

export const deleteShiftType = (id) => api.delete(`/shifts/types/${id}`)

export const getAssignments = (params) => api.get('/shifts/assignments', { params })

export const saveAssignments = (data) => api.post('/shifts/assignments', data)

export const getDaily = (params) => api.get('/shifts/daily', { params })

export const saveDaily = (data) => api.post('/shifts/daily', data)

export const deleteDaily = (id) => api.delete(`/shifts/daily/${id}`)

export const getSwapHistory = (params) => api.get('/shifts/swap-history', { params })

// 排班 Excel 匯入
export const getShiftImportTemplate = () =>
  api.get('/shifts/import-template', { responseType: 'blob' })

export const importShifts = (formData, weekStart) =>
  api.post(`/shifts/import?week_start=${weekStart}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// 排班 Excel 匯出
export const exportShifts = (weekStart) =>
  api.get('/exports/shifts', { params: { week_start: weekStart }, responseType: 'blob' })
