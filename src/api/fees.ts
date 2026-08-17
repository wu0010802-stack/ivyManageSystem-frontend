import api from './index'
import type { ApiBody, ApiResponse } from './_generated/typed'

export const getFeePeriods = () => api.get('/fees/periods').then((res) => res.data)
// params 維持 unknown：FeesTab.vue 以 Record<string, unknown> 建構（含條件式賦值），
// 改用 ApiQuery 會破壞既有 typecheck；回傳型別化以消除下游 as any（後端已補 response_model）。
export const getFeeRecords = (
  params: unknown,
): Promise<ApiResponse<'/fees/records', 'get'>> =>
  api.get('/fees/records', { params }).then((res) => res.data)
export const payFeeRecord = (id: number, data: unknown) => api.put(`/fees/records/${id}/pay`, data).then((res) => res.data)
export const refundFeeRecord = (id: number, data: unknown) => api.post(`/fees/records/${id}/refund`, data).then((res) => res.data)
export const suggestRefund = (recordId: number, payload: unknown) =>
  api.post(`/fees/records/${recordId}/refund-suggest`, payload).then((res) => res.data)
export const getFeeRefunds = (id: number) => api.get(`/fees/records/${id}/refunds`).then((res) => res.data)
// 退費列表（伺服器分頁；Phase 2 取代前端掃 100 筆逐筆查 refunds 的 fan-out）
// params 維持 unknown：FeeRefundsTab 以 Record<string, unknown> 建構（含條件式賦值），對齊本檔慣例。
export const getRefundedFeeRecords = (
  params: unknown,
): Promise<ApiResponse<'/fees/refunds', 'get'>> =>
  api.get('/fees/refunds', { params }).then((res) => res.data)
export const getFeeSummary = (params: unknown) => api.get('/fees/summary', { params }).then((res) => res.data)

// ===== 費用範本 =====
export const getFeeTemplates = (params: unknown = {}) =>
  api.get('/fees/templates', { params }).then((res) => res.data)
export const createFeeTemplate = (payload: unknown) =>
  api.post('/fees/templates', payload).then((res) => res.data)
export const updateFeeTemplate = (id: number, payload: unknown) =>
  api.put(`/fees/templates/${id}`, payload).then((res) => res.data)
export const deleteFeeTemplate = (id: number) =>
  api.delete(`/fees/templates/${id}`).then((res) => res.data)

// ===== 依範本批量產生費用單 =====
export const generateFeeRecords = (payload: unknown) =>
  api.post('/fees/generate', payload).then((res) => res.data)

// ===== 學費折抵 CRUD（同胞優惠 / 預繳 / 請假扣款 / 其他）=====
// getFeeAdjustments 參數維持 unknown：FeesTab.vue 以 Record<string, unknown> 傳入，
// 改用 ApiQuery 會破壞既有 typecheck（對齊本檔 getFeeRecords 慣例）。
export const getFeeAdjustments = (
  params?: unknown,
): Promise<ApiResponse<'/fees/adjustments', 'get'>> =>
  api.get('/fees/adjustments', { params }).then((res) => res.data)
export const createFeeAdjustment = (payload: ApiBody<'/fees/adjustments', 'post'>) =>
  api.post('/fees/adjustments', payload).then((res) => res.data)
export const updateFeeAdjustment = (
  id: number,
  payload: ApiBody<'/fees/adjustments/{adjustment_id}', 'put'>,
) => api.put(`/fees/adjustments/${id}`, payload).then((res) => res.data)
export const deleteFeeAdjustment = (id: number) =>
  api.delete(`/fees/adjustments/${id}`).then((res) => res.data)
