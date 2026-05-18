import api from './index'

export const getDailyAttendance = (studentId: number, date: string, config: unknown = {}) =>
  api.get('/parent/attendance/daily', {
    params: { student_id: studentId, ...(date ? { date } : {}) },
    ...(config as object),
  })

export const getMonthlyAttendance = (studentId: number, year: number, month: number, config: unknown = {}) =>
  api.get('/parent/attendance/monthly', {
    params: { student_id: studentId, year, month },
    ...(config as object),
  })
