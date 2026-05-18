import api from './index'

export const getShiftTypes = () => api.get('/shifts/types')

export const createShiftType = (data: unknown) => api.post('/shifts/types', data)

export const updateShiftType = (id: number, data: unknown) => api.put(`/shifts/types/${id}`, data)

export const deleteShiftType = (id: number) => api.delete(`/shifts/types/${id}`)

export const getAssignments = (params: unknown) => api.get('/shifts/assignments', { params })

export const saveAssignments = (data: unknown) => api.post('/shifts/assignments', data)

export const getDaily = (params: unknown) => api.get('/shifts/daily', { params })

export const saveDaily = (data: unknown) => api.post('/shifts/daily', data)

export const deleteDaily = (id: number) => api.delete(`/shifts/daily/${id}`)

export const getSwapHistory = (params: unknown) => api.get('/shifts/swap-history', { params })

// 排班 Excel 匯入
export const getShiftImportTemplate = () =>
  api.get('/shifts/import-template', { responseType: 'blob' })

export const importShifts = (formData: FormData, weekStart: string) =>
  api.post(`/shifts/import?week_start=${weekStart}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// 排班 Excel 匯出
export const exportShifts = (weekStart: string) =>
  api.get('/exports/shifts', { params: { week_start: weekStart }, responseType: 'blob' })
