import api from './index'

export const getDashboard = (params) => api.get('/reports/dashboard', { params })
