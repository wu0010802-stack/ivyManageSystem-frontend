import api from './index'
import type { AxiosResp } from './_generated/typed'

export const getAuditLogs = (params: unknown) => api.get('/audit-logs', { params })
export const getAuditLogsMeta = () => api.get('/audit-logs/meta')
export const exportAuditLogs = (params: unknown) =>
  api.get('/audit-logs/export', { params, responseType: 'blob' })

export async function getHighRiskAudits(params?: {
  days?: number
  unack_only?: boolean
  limit?: number
}): AxiosResp<'/audit-logs/high-risk', 'get'> {
  return api.get('/audit-logs/high-risk', { params })
}

export async function ackAudit(auditId: number): Promise<unknown> {
  return api.post(`/audit-logs/${auditId}/ack`)
}

export async function ackAllAudits(params?: { days?: number }): AxiosResp<'/audit-logs/ack-all', 'post'> {
  return api.post('/audit-logs/ack-all', null, { params })
}
