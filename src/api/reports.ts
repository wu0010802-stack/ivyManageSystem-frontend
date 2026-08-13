import api from './index'

export const getDashboard = (params: unknown) => api.get('/reports/dashboard', { params })

export const getFinanceSummary = (year: number, month?: number | null) => {
  const params: Record<string, unknown> = { year }
  if (month != null) params.month = month
  return api.get('/reports/finance-summary', { params })
}

export const getFinanceSummaryDetail = (year: number, month: number) =>
  api.get('/reports/finance-summary/detail', { params: { year, month } })

// 配合 utils/download.js 的 downloadFile(url)：回傳端點路徑
export const financeSummaryExportUrl = (year: number, month?: number | null) => {
  const qs = new URLSearchParams({ year: String(year) })
  if (month != null) qs.set('month', String(month))
  return `/reports/finance-summary/export?${qs.toString()}`
}

export const getAttendanceDetail = (year: number, { month = null, classroomId = null }: { month?: number | null; classroomId?: number | null } = {}) => {
  const params: Record<string, unknown> = { year }
  if (month != null) params.month = month
  if (classroomId != null) params.classroom_id = classroomId
  return api.get('/reports/attendance/detail', { params })
}

export const getSalaryContributors = (year: number, month: number) =>
  api.get('/reports/salary/contributors', { params: { year, month } })

// 月度現金收支表（現金收付實現制；試算表 layout：12 月 × 22 列項目 + pending_items 附錄）
// 後端契約：sections[].rows[].monthly[12] + totals.{income,refund,expense,net_cashflow,cumulative_net}
// 計算邏輯與 response 欄位名（net_cashflow 等）不動，僅正名顯示文案（2026-07-05 owner 裁定）
export const getMonthlyPnL = (year: number) =>
  api.get('/reports/monthly-pnl', { params: { year } }).then(r => r.data)

// 配合 utils/download 的 downloadFile(url)：回傳端點路徑（單一工作表 Excel，含口徑註記）
export const monthlyPnlExportUrl = (year: number) =>
  `/reports/monthly-pnl/export?${new URLSearchParams({ year: String(year) }).toString()}`
