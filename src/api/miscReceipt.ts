import api, { API_BASE } from './index'

/** 區間彙總（跨狀態），對應後端 GET /misc-receipts/summary。 */
export interface MiscReceiptSummary {
  total_count: number
  total_amount: number
  pending_count: number
  pending_amount: number
  signed_count: number
  signed_amount: number
}

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

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: '現金' },
  { value: 'bank_transfer', label: '銀行匯款' },
  { value: 'check', label: '支票' },
  { value: 'linepay', label: 'LINE Pay' },
  { value: 'other', label: '其他' },
]

export const paymentMethodLabel = (value: string) =>
  PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label || value

export const CATEGORY_OPTIONS = [
  { value: 'rent', label: '場地租金' },
  { value: 'donation', label: '捐款' },
  { value: 'subsidy', label: '補助款' },
  { value: 'secondhand_sale', label: '二手義賣' },
  { value: 'refund_recovery', label: '退費回收' },
  { value: 'other', label: '其他' },
]

export const categoryLabel = (value: string) =>
  CATEGORY_OPTIONS.find((o) => o.value === value)?.label || value
