import type { AxiosResponse } from 'axios'
import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// --- Disability Documents (Phase 1) ---
export const listDisabilityDocs = (
  studentId: number,
): AxiosResp<'/gov-moe/disability-documents', 'get'> =>
  api.get('/gov-moe/disability-documents', { params: { student_id: studentId } })

export const createDisabilityDoc = (payload: unknown) =>
  api.post('/gov-moe/disability-documents', payload)

export const updateDisabilityDoc = (id: number, payload: unknown) =>
  api.put(`/gov-moe/disability-documents/${id}`, payload)

export const deleteDisabilityDoc = (id: number) =>
  api.delete(`/gov-moe/disability-documents/${id}`)

// --- Dashboard Widget (Phase 1) ---
export const getDisabilityExpiryWidget = (days = 30) =>
  api.get('/gov-moe/dashboard/disability-expiry', { params: { days } })

// --- Enrollment Certificates (Phase 4C) ---
export const generateCertificate = (studentId: number, payload: unknown) =>
  api.post(`/gov-moe/certificates/${studentId}/generate`, payload)

export const listCertificateHistory = (params: unknown = {}) =>
  api.get('/gov-moe/certificates/history', { params })

// --- Special Subsidies (Phase 4B) ---
export const listSubsidies = (params: unknown = {}) =>
  api.get('/gov-moe/subsidies', { params })
export const createSubsidy = (payload: unknown) =>
  api.post('/gov-moe/subsidies', payload)
export const updateSubsidy = (id: number, payload: unknown) =>
  api.put(`/gov-moe/subsidies/${id}`, payload)
export const submitSubsidy = (id: number) =>
  api.put(`/gov-moe/subsidies/${id}/submit`)
export const approveSubsidy = (id: number, payload: unknown) =>
  api.put(`/gov-moe/subsidies/${id}/approve`, payload)
export const markSubsidyPaid = (id: number, payload: unknown) =>
  api.put(`/gov-moe/subsidies/${id}/mark_paid`, payload)
export const rejectSubsidy = (id: number) =>
  api.put(`/gov-moe/subsidies/${id}/reject`)
// 檔案類 endpoint 一律回 Blob；標明型別讓呼叫端能直接交給 saveBlobResponse
export const exportSubsidies = (params: unknown): Promise<AxiosResponse<Blob>> =>
  api.get('/gov-moe/subsidies/export', { params, responseType: 'blob' })

// --- IEP (Phase 4A) ---
export const listIeps = (params: unknown = {}) => api.get('/gov-moe/iep', { params })
export const createIep = (payload: unknown) => api.post('/gov-moe/iep', payload)
export const updateIep = (id: number, payload: unknown) => api.put(`/gov-moe/iep/${id}`, payload)
export const submitIep = (id: number) => api.put(`/gov-moe/iep/${id}/submit`)
export const approveIep = (id: number) => api.put(`/gov-moe/iep/${id}/approve`)
export const closeIep = (id: number) => api.put(`/gov-moe/iep/${id}/close`)
export const cloneIep = (id: number, payload: unknown) => api.post(`/gov-moe/iep/${id}/clone`, payload)
export const exportIepPdf = (id: number): Promise<AxiosResponse<Blob>> =>
  api.get(`/gov-moe/iep/${id}/export`, { responseType: 'blob' })

// --- Monthly Enrollment Report (Phase 2) ---
export const generateMonthlyReport = (
  payload: ApiBody<'/gov-moe/monthly/generate', 'post'>,
): AxiosResp<'/gov-moe/monthly/generate', 'post'> =>
  api.post('/gov-moe/monthly/generate', payload)

export const getMonthlyReport = (
  params: ApiQuery<'/gov-moe/monthly', 'get'>,
): AxiosResp<'/gov-moe/monthly', 'get'> =>
  api.get('/gov-moe/monthly', { params })

export const exportMonthlyReport = (
  params: { year: number; month: number },
): Promise<AxiosResponse<Blob>> =>
  api.get('/gov-moe/monthly/export', {
    params: { ...params, format: 'xlsx' },
    responseType: 'blob',
  })
