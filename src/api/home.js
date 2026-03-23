import api from './index'

export const getApprovalSummary = () => api.get('/approval-summary')

export const getUpcomingEvents = () => api.get('/upcoming-events')

export const getStudentAttendanceSummary = () => api.get('/student-attendance-summary')

export const getProbationAlerts = () => api.get('/employees/probation-alerts')
