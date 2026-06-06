import api, { API_BASE } from './index'

/** 區間彙總（跨狀態），對應後端 GET /vendor-payments/summary。 */
export interface VendorPaymentSummary {
  total_count: number
  total_amount: number
  pending_count: number
  pending_amount: number
  signed_count: number
  signed_amount: number
}

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

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: '現金' },
  { value: 'bank_transfer', label: '銀行匯款' },
  { value: 'check', label: '支票' },
  { value: 'linepay', label: 'LINE Pay' },
  { value: 'other', label: '其他' },
]

export const paymentMethodLabel = (value: string) =>
  PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label || value
