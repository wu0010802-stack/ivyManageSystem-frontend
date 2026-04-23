import api from './index'

export const fetchFunnel = (params) =>
  api.get('/analytics/funnel', { params })

export const fetchAtRisk = () =>
  api.get('/analytics/churn/at-risk')

export const fetchChurnHistory = (months = 12) =>
  api.get('/analytics/churn/history', { params: { months } })
