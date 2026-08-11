import api from './index'
import type { ApiBody } from '../../api/_generated/typed'

export interface SignRequestSummary {
  id: number
  student_id: number
  student_name: string
  title: string
  doc_type: string
  status: string
  sent_at: string
  signed_at: string | null
  has_pdf: boolean
}

export interface SignRequestListOut {
  pending: SignRequestSummary[]
  signed: SignRequestSummary[]
}

export interface SignRequestDetailOut extends SignRequestSummary {
  content_md: string
  content_hash: string
}

export const listMySignRequests = () => api.get<SignRequestListOut>('/parent/me/sign-requests')

export const getMySignRequest = (id: number) =>
  api.get<SignRequestDetailOut>(`/parent/me/sign-requests/${id}`)

export const signMyRequest = (
  id: number,
  payload: ApiBody<'/parent/me/sign-requests/{request_id}/sign', 'post'>,
) => api.post(`/parent/me/sign-requests/${id}/sign`, payload)

export const mySignPdfUrl = (id: number) =>
  `${api.defaults.baseURL}/parent/me/sign-requests/${id}/pdf`
