import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

export const listSignTemplates = (
  params: ApiQuery<'/sign-documents/templates', 'get'> = {},
): AxiosResp<'/sign-documents/templates', 'get'> =>
  api.get('/sign-documents/templates', { params })

export const createSignTemplate = (
  data: ApiBody<'/sign-documents/templates', 'post'>,
): AxiosResp<'/sign-documents/templates', 'post'> =>
  api.post('/sign-documents/templates', data)

export const updateSignTemplate = (
  templateId: number,
  data: ApiBody<'/sign-documents/templates/{template_id}', 'put'>,
): AxiosResp<'/sign-documents/templates/{template_id}', 'put'> =>
  api.put(`/sign-documents/templates/${templateId}`, data)

export const createSignBatch = (
  data: ApiBody<'/sign-documents/requests/batch', 'post'>,
): AxiosResp<'/sign-documents/requests/batch', 'post'> =>
  api.post('/sign-documents/requests/batch', data)

export const listSignRequests = (
  params: ApiQuery<'/sign-documents/requests', 'get'> = {},
): AxiosResp<'/sign-documents/requests', 'get'> =>
  api.get('/sign-documents/requests', { params })

export const getSignRequest = (
  requestId: number,
): AxiosResp<'/sign-documents/requests/{request_id}', 'get'> =>
  api.get(`/sign-documents/requests/${requestId}`)

export const voidSignRequest = (
  requestId: number,
  data: ApiBody<'/sign-documents/requests/{request_id}/void', 'post'>,
): AxiosResp<'/sign-documents/requests/{request_id}/void', 'post'> =>
  api.post(`/sign-documents/requests/${requestId}/void`, data)

export const resendSignNotification = (
  requestId: number,
): AxiosResp<'/sign-documents/requests/{request_id}/resend-notification', 'post'> =>
  api.post(`/sign-documents/requests/${requestId}/resend-notification`)

export const signRequestPdfUrl = (requestId: number): string =>
  `${api.defaults.baseURL}/sign-documents/requests/${requestId}/pdf`
