import api from './index'

export const getApprovalSummary = () => api.get('/approval-summary')

export const getUpcomingEvents = () => api.get('/upcoming-events')

export const getProbationAlerts = () => api.get('/probation-alerts')

export const getStudentAttendanceSummary = () => api.get('/student-attendance-summary')
