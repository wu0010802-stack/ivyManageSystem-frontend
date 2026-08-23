import type { ApiBody, AxiosResp } from './_generated/typed'
import api, { API_BASE } from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'
export { PAYMENT_METHOD_OPTIONS, paymentMethodLabel } from '@/constants/signoff'
export type { SignoffSummary as VendorPaymentSummary } from '@/constants/signoff'

export const listVendorPayments = (params: unknown) =>
  api.get('/vendor-payments', { params })

/**
 * 區間彙總：吃與列表相同的 range 篩選（start_date / end_date / vendor_name /
 * payment_method），但**不吃 status**——一律回全狀態並拆 pending / signed，
 * 供頂部 KPI 卡使用。
 */
export const getVendorPaymentSummary = (params?: unknown) =>
  api.get('/vendor-payments/summary', { params })

export const getVendorPayment = (id: number) => api.get(`/vendor-payments/${id}`)

export const createVendorPayment = (data: unknown) => api.post('/vendor-payments', data)

export const updateVendorPayment = (id: number, data: unknown) =>
  api.put(`/vendor-payments/${id}`, data)

export const deleteVendorPayment = (id: number) => api.delete(`/vendor-payments/${id}`)

export const signVendorPayment = (id: number, data: unknown) =>
  api.post(`/vendor-payments/${id}/sign`, data)

/**
 * 批次簽收：一次簽名套用到多筆待簽收付款（ids 1~100，去重）。
 * results 為每筆 {id, ok, error?}；succeeded/failed 為成功/失敗**筆數**（非 id 清單）。
 */
export const batchSignVendorPayments = (
  payload: ApiBody<'/vendor-payments/batch-sign', 'post'>,
): AxiosResp<'/vendor-payments/batch-sign', 'post'> =>
  api.post('/vendor-payments/batch-sign', payload)

export const uploadVendorPaymentAttachment = (id: number, formData: FormData) =>
  api.post(`/vendor-payments/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const deleteVendorPaymentAttachment = (id: number, key: string) =>
  api.delete(`/vendor-payments/${id}/attachments`, { params: { key } })

export const downloadVendorPaymentAttachmentUrl = (id: number, key: string) =>
  `${API_BASE}/vendor-payments/${id}/attachments/download?key=${encodeURIComponent(key)}`

export const vendorPaymentSignatureUrl = (id: number) =>
  `${API_BASE}/vendor-payments/${id}/signature`

// ─── 內控流程端點（方案 A：submit → approve/reject → settle → reconcile）───

export const submitVendorPayment = (
  id: number,
): Promise<AxiosResp<'/vendor-payments/{payment_id}/submit', 'post'>> =>
  api.post(`/vendor-payments/${id}/submit`)

export const approveVendorPayment = (
  id: number,
  data: ApiBody<'/vendor-payments/{payment_id}/approve', 'post'>,
): Promise<AxiosResp<'/vendor-payments/{payment_id}/approve', 'post'>> =>
  api.post(`/vendor-payments/${id}/approve`, data)

export const settleVendorPayment = (
  id: number,
  data: ApiBody<'/vendor-payments/{payment_id}/settle', 'post'>,
): Promise<AxiosResp<'/vendor-payments/{payment_id}/settle', 'post'>> =>
  api.post(`/vendor-payments/${id}/settle`, data)

export const reconcileVendorPayment = (
  id: number,
  data: ApiBody<'/vendor-payments/{payment_id}/reconcile', 'post'>,
): Promise<AxiosResp<'/vendor-payments/{payment_id}/reconcile', 'post'>> =>
  api.post(`/vendor-payments/${id}/reconcile`, data)

export const listVendorPaymentEvents = (
  id: number,
): Promise<AxiosResp<'/vendor-payments/{payment_id}/events', 'get'>> =>
  api.get(`/vendor-payments/${id}/events`)
