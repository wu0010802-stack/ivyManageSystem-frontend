import api from './index'
import type { ApiBody, ApiQuery, ApiResponse } from './_generated/typed'

export const getFeePeriods = () => api.get('/fees/periods').then((res) => res.data)
// params 維持 unknown：FeesTab.vue 以 Record<string, unknown> 建構（含條件式賦值），
// 改用 ApiQuery 會破壞既有 typecheck；回傳型別化以消除下游 as any（後端已補 response_model）。
export const getFeeRecords = (
  params: unknown,
): Promise<ApiResponse<'/fees/records', 'get'>> =>
  api.get('/fees/records', { params }).then((res) => res.data)
export const payFeeRecord = (id: number, data: unknown) => api.put(`/fees/records/${id}/pay`, data).then((res) => res.data)
// 批次登記繳費（語意固定「繳清全額」；部分繳費仍走單筆 payFeeRecord）
export const batchPayFeeRecords = (
  payload: ApiBody<'/fees/records/batch-pay', 'post'>,
): Promise<ApiResponse<'/fees/records/batch-pay', 'post'>> =>
  api.post('/fees/records/batch-pay', payload).then((res) => res.data)
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
// 月繳總表（帳單工作區「彙總繳費表」）：per-student 聚合，單月一次撈全、前端快篩
export const getFeeMonthlyStatement = (
  params: ApiQuery<'/fees/monthly-statement', 'get'>,
): Promise<ApiResponse<'/fees/monthly-statement', 'get'>> =>
  api.get('/fees/monthly-statement', { params }).then((res) => res.data)

// ===== 費用範本 =====
export const getFeeTemplates = (params: unknown = {}) =>
  api.get('/fees/templates', { params }).then((res) => res.data)
export const createFeeTemplate = (payload: unknown) =>
  api.post('/fees/templates', payload).then((res) => res.data)
export const updateFeeTemplate = (id: number, payload: unknown) =>
  api.put(`/fees/templates/${id}`, payload).then((res) => res.data)
export const deleteFeeTemplate = (id: number) =>
  api.delete(`/fees/templates/${id}`).then((res) => res.data)
// 整學年複製（SPEC-015 年度設定）：金額照抄、收費/逾期日自動平移、既有組合冪等 skip
export const copyYearFeeTemplates = (
  payload: ApiBody<'/fees/templates/copy-year', 'post'>,
): Promise<ApiResponse<'/fees/templates/copy-year', 'post'>> =>
  api.post('/fees/templates/copy-year', payload).then((res) => res.data)

// 手動補產費用單（2026-09-01 起與每日排程並行）：dry_run 預覽 → 確認寫入；
// 冪等，已存在（學生 × 範本 × 月份）組合自動跳過。後端未標 response_model，
// 回傳形狀以 ivy-backend api/fees/generation.py 為準，於此手寫窄型別。
export interface FeeGenerateResult {
  created: number
  skipped: number
  dry_run: boolean
  preview?: Record<string, unknown>[]
}
export const generateFeeRecords = (
  payload: ApiBody<'/fees/generate', 'post'>,
): Promise<FeeGenerateResult> =>
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

// ============================================================================
// SPEC-014：銀行對帳 / 銷帳碼 / 預繳款 / 現金交接 / 關帳
// 型別自 OpenAPI codegen 下放（後端全數標 response_model）；沿用本檔自解包慣例。
// ============================================================================

// ===== 銷帳末四碼 =====
export const getBillingCodes = (
  params?: unknown,
): Promise<ApiResponse<'/fees/billing-codes', 'get'>> =>
  api.get('/fees/billing-codes', { params }).then((res) => res.data)
export const suggestBillingCodes = (
  payload: ApiBody<'/fees/billing-codes/suggest', 'post'>,
): Promise<ApiResponse<'/fees/billing-codes/suggest', 'post'>> =>
  api.post('/fees/billing-codes/suggest', payload).then((res) => res.data)
export const activateBillingCodes = (
  payload: ApiBody<'/fees/billing-codes/activate', 'post'>,
): Promise<ApiResponse<'/fees/billing-codes/activate', 'post'>> =>
  api.post('/fees/billing-codes/activate', payload).then((res) => res.data)
export const deactivateBillingCode = (
  id: number,
  payload: ApiBody<'/fees/billing-codes/{assignment_id}/deactivate', 'post'>,
) => api.post(`/fees/billing-codes/${id}/deactivate`, payload).then((res) => res.data)

// ===== 永豐 CSV 匯入 =====
export const previewBankImport = (
  file: File,
): Promise<ApiResponse<'/fees/bank-imports/preview', 'post'>> => {
  const form = new FormData()
  form.append('file', file)
  return api
    .post('/fees/bank-imports/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data)
}
export const confirmBankImport = (
  file: File,
): Promise<ApiResponse<'/fees/bank-imports', 'post'>> => {
  const form = new FormData()
  form.append('file', file)
  return api
    .post('/fees/bank-imports', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data)
}
export const getBankImports = (): Promise<ApiResponse<'/fees/bank-imports', 'get'>> =>
  api.get('/fees/bank-imports').then((res) => res.data)

// ===== 銀行交易工作台 =====
export const getBankTransactions = (
  params?: unknown,
): Promise<ApiResponse<'/fees/bank-transactions', 'get'>> =>
  api.get('/fees/bank-transactions', { params }).then((res) => res.data)
export const getTransactionCandidates = (
  txnId: number,
): Promise<ApiResponse<'/fees/bank-transactions/{txn_id}/candidates', 'get'>> =>
  api.get(`/fees/bank-transactions/${txnId}/candidates`).then((res) => res.data)
export const allocateTransaction = (
  txnId: number,
  payload: ApiBody<'/fees/bank-transactions/{txn_id}/allocate', 'post'>,
): Promise<ApiResponse<'/fees/bank-transactions/{txn_id}/allocate', 'post'>> =>
  api.post(`/fees/bank-transactions/${txnId}/allocate`, payload).then((res) => res.data)
export const ignoreTransaction = (
  txnId: number,
  payload: ApiBody<'/fees/bank-transactions/{txn_id}/ignore', 'post'>,
) => api.post(`/fees/bank-transactions/${txnId}/ignore`, payload).then((res) => res.data)
export const reverseTransaction = (
  txnId: number,
  payload: ApiBody<'/fees/bank-transactions/{txn_id}/reverse', 'post'>,
) => api.post(`/fees/bank-transactions/${txnId}/reverse`, payload).then((res) => res.data)

// ===== 永豐代收核銷明細（SPEC-016：對帳主來源）=====
export const previewCollectionImport = (
  file: File,
): Promise<ApiResponse<'/fees/collection-imports/preview', 'post'>> => {
  const form = new FormData()
  form.append('file', file)
  return api
    .post('/fees/collection-imports/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data)
}
export const confirmCollectionImport = (
  file: File,
): Promise<ApiResponse<'/fees/collection-imports', 'post'>> => {
  const form = new FormData()
  form.append('file', file)
  return api
    .post('/fees/collection-imports', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data)
}
export const getCollectionPayments = (
  params?: unknown,
): Promise<ApiResponse<'/fees/collection-payments', 'get'>> =>
  api.get('/fees/collection-payments', { params }).then((res) => res.data)
export const getCollectionCandidates = (
  paymentId: number,
): Promise<ApiResponse<'/fees/collection-payments/{payment_id}/candidates', 'get'>> =>
  api.get(`/fees/collection-payments/${paymentId}/candidates`).then((res) => res.data)
export const allocateCollectionPayment = (
  paymentId: number,
  payload: ApiBody<'/fees/collection-payments/{payment_id}/allocate', 'post'>,
): Promise<ApiResponse<'/fees/collection-payments/{payment_id}/allocate', 'post'>> =>
  api.post(`/fees/collection-payments/${paymentId}/allocate`, payload).then((res) => res.data)
export const reverseCollectionPayment = (
  paymentId: number,
  payload: ApiBody<'/fees/collection-payments/{payment_id}/reverse', 'post'>,
) => api.post(`/fees/collection-payments/${paymentId}/reverse`, payload).then((res) => res.data)
export const reconcileCollectionCoverage = (
  payload: ApiBody<'/fees/collection-coverage', 'post'>,
): Promise<ApiResponse<'/fees/collection-coverage', 'post'>> =>
  api.post('/fees/collection-coverage', payload).then((res) => res.data)

// ===== 發單快照與未繳差集（SPEC-016 Phase 3）=====
export const previewBillSlipBatch = (
  file: File,
): Promise<ApiResponse<'/fees/bill-slip-batches/preview', 'post'>> => {
  const form = new FormData()
  form.append('file', file)
  return api
    .post('/fees/bill-slip-batches/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data)
}
export const importBillSlipBatch = (
  file: File,
  meta: { title: string; batch_no?: string },
): Promise<ApiResponse<'/fees/bill-slip-batches', 'post'>> => {
  const form = new FormData()
  form.append('file', file)
  form.append('title', meta.title)
  if (meta.batch_no) form.append('batch_no', meta.batch_no)
  return api
    .post('/fees/bill-slip-batches', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data)
}
export const getBillSlipBatches = (
  params?: unknown,
): Promise<ApiResponse<'/fees/bill-slip-batches', 'get'>> =>
  api.get('/fees/bill-slip-batches', { params }).then((res) => res.data)
export const deleteBillSlipBatch = (
  batchId: number,
): Promise<ApiResponse<'/fees/bill-slip-batches/{batch_id}', 'delete'>> =>
  api.delete(`/fees/bill-slip-batches/${batchId}`).then((res) => res.data)
export const getOutstandingReport = (
  batchId: number,
  params?: unknown,
): Promise<ApiResponse<'/fees/bill-slip-batches/{batch_id}/outstanding', 'get'>> =>
  api
    .get(`/fees/bill-slip-batches/${batchId}/outstanding`, { params })
    .then((res) => res.data)
// SPEC-018：發單批次一鍵產生費用單（一生一筆淨額單；dry_run 先預覽）
export const generateBillSlipRecords = (
  batchId: number,
  payload: ApiBody<'/fees/bill-slip-batches/{batch_id}/generate-records', 'post'>,
): Promise<
  ApiResponse<'/fees/bill-slip-batches/{batch_id}/generate-records', 'post'>
> =>
  api
    .post(`/fees/bill-slip-batches/${batchId}/generate-records`, payload)
    .then((res) => res.data)

// ===== 現金收款 / 收款流水 =====
export const createCashReceipt = (
  payload: ApiBody<'/fees/cash-receipts', 'post'>,
): Promise<ApiResponse<'/fees/cash-receipts', 'post'>> =>
  api.post('/fees/cash-receipts', payload).then((res) => res.data)
export const getFeeReceipts = (
  params?: unknown,
): Promise<ApiResponse<'/fees/receipts', 'get'>> =>
  api.get('/fees/receipts', { params }).then((res) => res.data)

// ===== 預繳款 =====
export const getPrepayments = (
  params?: unknown,
): Promise<ApiResponse<'/fees/prepayments', 'get'>> =>
  api.get('/fees/prepayments', { params }).then((res) => res.data)
export const getPrepaymentMovements = (
  creditId: number,
): Promise<ApiResponse<'/fees/prepayments/{credit_id}/movements', 'get'>> =>
  api.get(`/fees/prepayments/${creditId}/movements`).then((res) => res.data)
export const applyPrepayment = (
  creditId: number,
  payload: ApiBody<'/fees/prepayments/{credit_id}/apply', 'post'>,
) => api.post(`/fees/prepayments/${creditId}/apply`, payload).then((res) => res.data)
export const transferPrepayment = (creditId: number) =>
  api.post(`/fees/prepayments/${creditId}/transfer`).then((res) => res.data)
export const reversePrepaymentApply = (
  creditId: number,
  payload: ApiBody<'/fees/prepayments/{credit_id}/reverse', 'post'>,
) => api.post(`/fees/prepayments/${creditId}/reverse`, payload).then((res) => res.data)

// ===== 預繳現金退款 =====
export const getPrepaymentRefunds = (
  params?: unknown,
): Promise<ApiResponse<'/fees/prepayment-refunds', 'get'>> =>
  api.get('/fees/prepayment-refunds', { params }).then((res) => res.data)
export const createPrepaymentRefund = (
  payload: ApiBody<'/fees/prepayment-refunds', 'post'>,
) => api.post('/fees/prepayment-refunds', payload).then((res) => res.data)
export const approvePrepaymentRefund = (refundId: number) =>
  api.post(`/fees/prepayment-refunds/${refundId}/approve`).then((res) => res.data)
export const completePrepaymentRefund = (
  refundId: number,
  payload: ApiBody<'/fees/prepayment-refunds/{refund_id}/complete', 'post'>,
) => api.post(`/fees/prepayment-refunds/${refundId}/complete`, payload).then((res) => res.data)
export const cancelPrepaymentRefund = (
  refundId: number,
  payload: ApiBody<'/fees/prepayment-refunds/{refund_id}/cancel', 'post'>,
) => api.post(`/fees/prepayment-refunds/${refundId}/cancel`, payload).then((res) => res.data)

// ===== 現金交接 =====
export const getCashHandovers = (
  params?: unknown,
): Promise<ApiResponse<'/fees/cash-handovers', 'get'>> =>
  api.get('/fees/cash-handovers', { params }).then((res) => res.data)
export const submitCashHandover = (batchId: number) =>
  api.post(`/fees/cash-handovers/${batchId}/submit`).then((res) => res.data)
export const confirmCashHandover = (
  batchId: number,
  payload: ApiBody<'/fees/cash-handovers/{batch_id}/confirm', 'post'>,
) => api.post(`/fees/cash-handovers/${batchId}/confirm`, payload).then((res) => res.data)
export const reopenCashHandover = (
  batchId: number,
  payload: ApiBody<'/fees/cash-handovers/{batch_id}/reopen', 'post'>,
) => api.post(`/fees/cash-handovers/${batchId}/reopen`, payload).then((res) => res.data)

// ===== 當期關帳 =====
export const getCloseSummary = (
  year: number,
  month: number,
): Promise<ApiResponse<'/fees/close-periods/summary', 'get'>> =>
  api
    .get('/fees/close-periods/summary', { params: { year, month } })
    .then((res) => res.data)
export const getClosePeriods = (
  params?: unknown,
): Promise<ApiResponse<'/fees/close-periods', 'get'>> =>
  api.get('/fees/close-periods', { params }).then((res) => res.data)
export const closePeriod = (
  payload: ApiBody<'/fees/close-periods', 'post'>,
): Promise<ApiResponse<'/fees/close-periods', 'post'>> =>
  api.post('/fees/close-periods', payload).then((res) => res.data)
export const reopenClosePeriod = (
  closeId: number,
  payload: ApiBody<'/fees/close-periods/{close_id}/reopen', 'post'>,
) => api.post(`/fees/close-periods/${closeId}/reopen`, payload).then((res) => res.data)
