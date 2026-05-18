import api from './index'

export const getAuditLogs = (params: unknown) => api.get('/audit-logs', { params })
export const getAuditLogsMeta = () => api.get('/audit-logs/meta')
export const exportAuditLogs = (params: unknown) =>
  api.get('/audit-logs/export', { params, responseType: 'blob' })
