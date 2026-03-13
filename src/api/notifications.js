import api from './index'

export const getNotificationSummary = () => api.get('/notifications/summary')
