import api from './index'

export const listVendorPayments = (params: unknown) =>
  api.get('/vendor-payments', { params })

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
  `/api/vendor-payments/${id}/attachments/download?key=${encodeURIComponent(key)}`

export const vendorPaymentSignatureUrl = (id: number) =>
  `/api/vendor-payments/${id}/signature`

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: '現金' },
  { value: 'bank_transfer', label: '銀行匯款' },
  { value: 'check', label: '支票' },
  { value: 'linepay', label: 'LINE Pay' },
  { value: 'other', label: '其他' },
]

export const paymentMethodLabel = (value: string) =>
  PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label || value
