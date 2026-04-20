import api from './index'

export const getAuditLogs = (params) => api.get('/audit-logs', { params })
export const getAuditLogsMeta = () => api.get('/audit-logs/meta')
export const exportAuditLogs = (params) =>
  api.get('/audit-logs/export', { params, responseType: 'blob' })
