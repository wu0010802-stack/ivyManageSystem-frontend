import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

export type ListReportsQuery = ApiQuery<'/data-quality/reports', 'get'>
export type AckBody = ApiBody<'/data-quality/reports/{report_id}/ack', 'post'>
export type ResolveBody = ApiBody<
  '/data-quality/reports/{report_id}/resolve',
  'post'
>
export type IgnoreBody = ApiBody<
  '/data-quality/reports/{report_id}/ignore',
  'post'
>

export function listReports(
  query?: ListReportsQuery,
): AxiosResp<'/data-quality/reports', 'get'> {
  return api.get('/data-quality/reports', { params: query })
}

export function ackReport(
  id: number,
  body: AckBody,
): AxiosResp<'/data-quality/reports/{report_id}/ack', 'post'> {
  return api.post(`/data-quality/reports/${id}/ack`, body)
}

export function resolveReport(
  id: number,
  body: ResolveBody,
): AxiosResp<'/data-quality/reports/{report_id}/resolve', 'post'> {
  return api.post(`/data-quality/reports/${id}/resolve`, body)
}

export function ignoreReport(
  id: number,
  body: IgnoreBody,
): AxiosResp<'/data-quality/reports/{report_id}/ignore', 'post'> {
  return api.post(`/data-quality/reports/${id}/ignore`, body)
}

export function runNow(): AxiosResp<'/data-quality/run-now', 'post'> {
  return api.post('/data-quality/run-now')
}
