import api from './index'

export const getDailyAttendance = (studentId, date, config = {}) =>
  api.get('/parent/attendance/daily', {
    params: { student_id: studentId, ...(date ? { date } : {}) },
    ...config,
  })

export const getMonthlyAttendance = (studentId, year, month, config = {}) =>
  api.get('/parent/attendance/monthly', {
    params: { student_id: studentId, year, month },
    ...config,
  })
