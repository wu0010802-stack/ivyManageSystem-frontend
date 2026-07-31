import api from './index'

export const getMonthlyAttendance = (studentId: number, year: number, month: number, config: unknown = {}) =>
  api.get('/parent/attendance/monthly', {
    params: { student_id: studentId, year, month },
    ...(config as object),
  })
