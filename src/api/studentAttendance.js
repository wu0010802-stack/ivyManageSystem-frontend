import api from './index'

export const getDailyAttendance = (params) =>
  api.get('/student-attendance', { params })

export const batchSaveAttendance = (data) =>
  api.post('/student-attendance/batch', data)

export const getMonthlySummary = (params) =>
  api.get('/student-attendance/monthly', { params })

export const exportStudentAttendance = (params) =>
  api.get('/student-attendance/export', { params, responseType: 'blob' })
