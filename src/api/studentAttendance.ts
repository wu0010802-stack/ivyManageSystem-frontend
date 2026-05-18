import api from './index'

export const getAttendanceOverview = (params: unknown) =>
  api.get('/student-attendance/overview', { params })

export const getDailyAttendance = (params: unknown) =>
  api.get('/student-attendance', { params })

export const batchSaveAttendance = (data: unknown) =>
  api.post('/student-attendance/batch', data)

export const getMonthlySummary = (params: unknown) =>
  api.get('/student-attendance/monthly', { params })

export const exportStudentAttendance = (params: unknown) =>
  api.get('/student-attendance/export', { params, responseType: 'blob' })

export const getAttendanceByStudent = (studentId: number, params: Record<string, unknown> = {}) =>
  api.get('/student-attendance/by-student', {
    params: { student_id: studentId, ...params },
  })
