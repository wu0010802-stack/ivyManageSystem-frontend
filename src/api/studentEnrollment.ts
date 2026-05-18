import api from './index'

export const getEnrollmentStats = (params: unknown) => api.get('/student-enrollment/stats', { params })
export const getEnrollmentOptions = () => api.get('/student-enrollment/options')
export const getEnrollmentRoster = (params: unknown) => api.get('/student-enrollment/roster', { params })
export const getEnrollmentRosterPdf = (params: unknown) =>
  api.get('/student-enrollment/roster.pdf', { params, responseType: 'blob' })

export const getBonusDashboard = (params: unknown) => api.get('/bonus-preview/dashboard', { params })
