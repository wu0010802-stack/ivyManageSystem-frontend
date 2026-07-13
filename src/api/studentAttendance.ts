import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

export const getAttendanceOverview = (params: unknown) =>
  api.get('/student-attendance/overview', { params })

export const getDailyAttendance = (
  params: ApiQuery<'/student-attendance', 'get'>,
): AxiosResp<'/student-attendance', 'get'> =>
  api.get('/student-attendance', { params })

export const batchSaveAttendance = (
  data: ApiBody<'/student-attendance/batch', 'post'>,
): AxiosResp<'/student-attendance/batch', 'post'> =>
  api.post('/student-attendance/batch', data)

export const getMonthlySummary = (params: unknown) =>
  api.get('/student-attendance/monthly', { params })

export const exportStudentAttendance = (params: unknown) =>
  api.get('/student-attendance/export', { params, responseType: 'blob' })

export const getAttendanceByStudent = (
  studentId: number,
  params: Partial<Omit<ApiQuery<'/student-attendance/by-student', 'get'>, 'student_id'>> = {},
): AxiosResp<'/student-attendance/by-student', 'get'> =>
  api.get('/student-attendance/by-student', {
    params: { student_id: studentId, ...params },
  })
