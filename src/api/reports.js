import api from './index'

export const getDashboard = (params) => api.get('/reports/dashboard', { params })

export const getFinanceSummary = (year, month) => {
  const params = { year }
  if (month != null) params.month = month
  return api.get('/reports/finance-summary', { params })
}

export const getFinanceSummaryDetail = (year, month) =>
  api.get('/reports/finance-summary/detail', { params: { year, month } })

// 配合 utils/download.js 的 downloadFile(url)：回傳端點路徑
export const financeSummaryExportUrl = (year, month) => {
  const qs = new URLSearchParams({ year: String(year) })
  if (month != null) qs.set('month', String(month))
  return `/reports/finance-summary/export?${qs.toString()}`
}

export const getAttendanceDetail = (year, { month = null, classroomId = null } = {}) => {
  const params = { year }
  if (month != null) params.month = month
  if (classroomId != null) params.classroom_id = classroomId
  return api.get('/reports/attendance/detail', { params })
}

export const getSalaryContributors = (year, month) =>
  api.get('/reports/salary/contributors', { params: { year, month } })

// 月度損益表（試算表 layout：12 月 × 22 列項目 + pending_items 附錄）
// 後端契約：sections[].rows[].monthly[12] + totals.{income,refund,expense,net_cashflow}
export const getMonthlyPnL = (year) =>
  api.get('/reports/monthly-pnl', { params: { year } }).then(r => r.data)
