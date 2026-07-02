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
