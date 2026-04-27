import api from './index'

export const getDailyAttendance = (studentId, date) =>
  api.get('/parent/attendance/daily', {
    params: { student_id: studentId, ...(date ? { date } : {}) },
  })

export const getMonthlyAttendance = (studentId, year, month) =>
  api.get('/parent/attendance/monthly', {
    params: { student_id: studentId, year, month },
  })
