import api from './index'

export const getEnrollmentStats = (params) => api.get('/student-enrollment/stats', { params })
export const getEnrollmentOptions = () => api.get('/student-enrollment/options')
export const getEnrollmentRoster = (params) => api.get('/student-enrollment/roster', { params })
