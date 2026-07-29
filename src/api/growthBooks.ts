import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// 成長報告族（list / download / send-line）沿用既有 src/api/studentGrowthReports.ts，
// 本檔只放三個真正新增的成長冊端點，避免重複 API surface。

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
