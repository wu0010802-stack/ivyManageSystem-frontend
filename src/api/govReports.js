import api from './index'

export const getLaborInsurance = (params) =>
  api.get('/gov-reports/labor-insurance', { params, responseType: 'blob' })

export const getHealthInsurance = (params) =>
  api.get('/gov-reports/health-insurance', { params, responseType: 'blob' })

export const getWithholding = (params) =>
  api.get('/gov-reports/withholding', { params, responseType: 'blob' })

export const getPension = (params) =>
  api.get('/gov-reports/pension', { params, responseType: 'blob' })
