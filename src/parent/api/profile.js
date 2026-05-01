import api from './index'

export const getMe = () => api.get('/parent/me')

export const getMyChildren = () => api.get('/parent/my-children')

export const getHomeSummary = () => api.get('/parent/home/summary')

export const getTodayStatus = () => api.get('/parent/home/today-status')

export const getChildProfile = (studentId) =>
  api.get(`/parent/students/${studentId}/profile`)
