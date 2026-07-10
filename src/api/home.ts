import api from './index'
import type { AxiosResp } from './_generated/typed'

export const getApprovalSummary = () => api.get('/approval-summary')

export const getUpcomingEvents = () => api.get('/upcoming-events')

export const getStudentAttendanceSummary = () => api.get('/student-attendance-summary')

export const getProbationAlerts = (): AxiosResp<'/employees/probation-alerts', 'get'> =>
  api.get('/employees/probation-alerts')
