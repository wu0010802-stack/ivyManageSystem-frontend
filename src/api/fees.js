import api from './index'

export const getFeePeriods = () => api.get('/fees/periods').then((res) => res.data)
export const getFeeRecords = (params) => api.get('/fees/records', { params }).then((res) => res.data)
export const payFeeRecord = (id, data) => api.put(`/fees/records/${id}/pay`, data).then((res) => res.data)
export const refundFeeRecord = (id, data) => api.post(`/fees/records/${id}/refund`, data).then((res) => res.data)
export const suggestRefund = (recordId, payload) =>
  api.post(`/fees/records/${recordId}/refund-suggest`, payload).then((res) => res.data)
export const getFeeRefunds = (id) => api.get(`/fees/records/${id}/refunds`).then((res) => res.data)
export const getFeeSummary = (params) => api.get('/fees/summary', { params }).then((res) => res.data)

// ===== 費用範本 =====
export const getFeeTemplates = (params = {}) =>
  api.get('/fees/templates', { params }).then((res) => res.data)
export const createFeeTemplate = (payload) =>
  api.post('/fees/templates', payload).then((res) => res.data)
export const updateFeeTemplate = (id, payload) =>
  api.put(`/fees/templates/${id}`, payload).then((res) => res.data)
export const deleteFeeTemplate = (id) =>
  api.delete(`/fees/templates/${id}`).then((res) => res.data)

// ===== 依範本批量產生費用單 =====
export const generateFeeRecords = (payload) =>
  api.post('/fees/generate', payload).then((res) => res.data)

// ===== Stub (worktree-local only) — 2026-05-17 contact book redesign pilot
// 真實 endpoint 在 user `refactor-fees-by-class` WIP 尚未 merge 到 main。
// 本 stub 只為了讓 FeesTab.vue 在 pilot 分支上能編譯 / dev server 起得來。
// user merge `refactor-fees-by-class` 後請刪除本行。
export const getFeeAdjustments = () => Promise.resolve({ items: [] })
