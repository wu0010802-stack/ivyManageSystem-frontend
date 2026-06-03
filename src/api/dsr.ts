import api from './index'
import type { ApiQuery, ApiBody, AxiosResp } from './_generated/typed'

export const listDsrRequests = (
  params?: ApiQuery<'/admin/dsr-requests', 'get'>,
): AxiosResp<'/admin/dsr-requests', 'get'> => api.get('/admin/dsr-requests', { params })

export const approveDsrRequest = (
  id: number,
  data: ApiBody<'/admin/dsr-requests/{req_id}/approve', 'post'>,
): AxiosResp<'/admin/dsr-requests/{req_id}/approve', 'post'> =>
  api.post(`/admin/dsr-requests/${id}/approve`, data)

export const rejectDsrRequest = (
  id: number,
  data: ApiBody<'/admin/dsr-requests/{req_id}/reject', 'post'>,
): AxiosResp<'/admin/dsr-requests/{req_id}/reject', 'post'> =>
  api.post(`/admin/dsr-requests/${id}/reject`, data)
