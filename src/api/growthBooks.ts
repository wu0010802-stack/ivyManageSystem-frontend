import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

export const draftGrowthBook = (
  studentId: number,
  data: ApiBody<'/students/{student_id}/growth-books/draft', 'post'>,
): AxiosResp<'/students/{student_id}/growth-books/draft', 'post'> =>
  api.post(`/students/${studentId}/growth-books/draft`, data)

export const createGrowthBook = (
  studentId: number,
  data: ApiBody<'/students/{student_id}/growth-books', 'post'>,
): AxiosResp<'/students/{student_id}/growth-books', 'post'> =>
  api.post(`/students/${studentId}/growth-books`, data)

export const getGrowthBookBatchStatus = (
  params: ApiQuery<'/growth-books/batch-status', 'get'>,
): AxiosResp<'/growth-books/batch-status', 'get'> =>
  api.get('/growth-books/batch-status', { params })

export const listGrowthReports = (
  studentId: number,
  params: ApiQuery<'/students/{student_id}/growth-reports', 'get'> = {},
): AxiosResp<'/students/{student_id}/growth-reports', 'get'> =>
  api.get(`/students/${studentId}/growth-reports`, { params })

export const sendGrowthReportLine = (studentId: number, reportId: number) =>
  api.post(`/students/${studentId}/growth-reports/${reportId}/send-line`)

export const growthReportDownloadUrl = (studentId: number, reportId: number) =>
  `${api.defaults.baseURL}/students/${studentId}/growth-reports/${reportId}/download`
