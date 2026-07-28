import api from './index'
import type {
  ApiBody,
  ApiQuery,
  ApiResponse,
  AxiosResp,
} from './_generated/typed'

export type ListReportsQuery = ApiQuery<'/data-quality/reports', 'get'>

/**
 * 單筆報告的形狀。刻意由 ApiResponse 往下推導而非用 Schema<'ReportOut'>：
 * 後端 model 若日後撞名被 FastAPI 改成模組限定名，此處不受影響。
 */
export type DataQualityReportRow = ApiResponse<
  '/data-quality/reports',
  'get'
>['items'][number]

export type DataQualitySummary = ApiResponse<'/data-quality/summary', 'get'>
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

/** 全站待處理統計 + 最後掃描日；與列表篩選無關，故為獨立端點。 */
export function getSummary(): AxiosResp<'/data-quality/summary', 'get'> {
  return api.get('/data-quality/summary')
}
