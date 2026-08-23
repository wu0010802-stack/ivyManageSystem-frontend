import type { ApiBody, AxiosResp } from './_generated/typed'
import api, { API_BASE } from './index'
export {
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
  CATEGORY_OPTIONS,
  categoryLabel,
} from '@/constants/signoff'
export type { SignoffSummary as MiscReceiptSummary } from '@/constants/signoff'

export const listMiscReceipts = (params: unknown) =>
  api.get('/misc-receipts', { params })

/**
 * 區間彙總：吃與列表相同的 range 篩選（start_date / end_date / payer_name /
 * payment_method / category），但**不吃 status**——一律回全狀態並拆 pending / signed，
 * 供頂部 KPI 卡使用。
 */
export const getMiscReceiptSummary = (params?: unknown) =>
  api.get('/misc-receipts/summary', { params })

export const getMiscReceipt = (id: number) => api.get(`/misc-receipts/${id}`)

export const createMiscReceipt = (data: unknown) => api.post('/misc-receipts', data)

export const updateMiscReceipt = (id: number, data: unknown) =>
  api.put(`/misc-receipts/${id}`, data)

export const deleteMiscReceipt = (id: number) => api.delete(`/misc-receipts/${id}`)

export const signMiscReceipt = (id: number, data: unknown) =>
  api.post(`/misc-receipts/${id}/sign`, data)

/**
 * 批次簽收：一次簽名套用到多筆待簽收收款（ids 1~100，去重）。
 * results 為每筆 {id, ok, error?}；succeeded/failed 為成功/失敗**筆數**（非 id 清單）。
 */
export const batchSignMiscReceipts = (
  payload: ApiBody<'/misc-receipts/batch-sign', 'post'>,
): AxiosResp<'/misc-receipts/batch-sign', 'post'> =>
  api.post('/misc-receipts/batch-sign', payload)

export const uploadMiscReceiptAttachment = (id: number, formData: FormData) =>
  api.post(`/misc-receipts/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const deleteMiscReceiptAttachment = (id: number, key: string) =>
  api.delete(`/misc-receipts/${id}/attachments`, { params: { key } })

export const downloadMiscReceiptAttachmentUrl = (id: number, key: string) =>
  `${API_BASE}/misc-receipts/${id}/attachments/download?key=${encodeURIComponent(key)}`

export const miscReceiptSignatureUrl = (id: number) =>
  `${API_BASE}/misc-receipts/${id}/signature`

// ─── 內控流程端點（方案 A；收入側：可先 settle 再送審）──────────────────

export const submitMiscReceipt = (
  id: number,
): Promise<AxiosResp<'/misc-receipts/{receipt_id}/submit', 'post'>> =>
  api.post(`/misc-receipts/${id}/submit`)

export const approveMiscReceipt = (
  id: number,
  data: ApiBody<'/misc-receipts/{receipt_id}/approve', 'post'>,
): Promise<AxiosResp<'/misc-receipts/{receipt_id}/approve', 'post'>> =>
  api.post(`/misc-receipts/${id}/approve`, data)

export const settleMiscReceipt = (
  id: number,
  data: ApiBody<'/misc-receipts/{receipt_id}/settle', 'post'>,
): Promise<AxiosResp<'/misc-receipts/{receipt_id}/settle', 'post'>> =>
  api.post(`/misc-receipts/${id}/settle`, data)

export const reconcileMiscReceipt = (
  id: number,
  data: ApiBody<'/misc-receipts/{receipt_id}/reconcile', 'post'>,
): Promise<AxiosResp<'/misc-receipts/{receipt_id}/reconcile', 'post'>> =>
  api.post(`/misc-receipts/${id}/reconcile`, data)

export const listMiscReceiptEvents = (
  id: number,
): Promise<AxiosResp<'/misc-receipts/{receipt_id}/events', 'get'>> =>
  api.get(`/misc-receipts/${id}/events`)
