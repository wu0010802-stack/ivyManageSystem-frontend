import api from './index'

export const uploadFile = (formData) =>
  api.post('/attendance/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const uploadCsv = (payload) => api.post('/attendance/upload-csv', payload)

export const getRecords = (params) => api.get('/attendance/records', { params })

export const getSummary = (params) => api.get('/attendance/summary', { params })

// 刪除整月份考勤
export const deleteMonthRecords = (year, month) =>
  api.delete(`/attendance/records/${year}/${month}`)

// 刪除特定員工某日考勤
export const deleteEmployeeDateRecord = (employeeId, date) =>
  api.delete(`/attendance/records/${employeeId}/${date}`)

export const getToday = () => api.get('/attendance/today')

export const getTodayAnomalies = (params) =>
  api.get('/attendance/today-anomalies', { params })

// 管理端異常批次處理
export const getAnomalyList = (params) =>
  api.get('/attendance/anomalies', { params })

export const batchConfirmAnomalies = (payload) =>
  api.post('/attendance/anomalies/batch-confirm', payload)

export const exportAnomalies = (year, month, status = 'all') =>
  api.get('/attendance/anomalies/export', { params: { year, month, status }, responseType: 'blob' })

export const exportEmployeeAttendance = (params) =>
  api.get('/exports/employee-attendance', { params, responseType: 'blob' })
