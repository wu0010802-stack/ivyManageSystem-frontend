import api from './index'

// 統計
export const getActivityStats = () => api.get('/activity/stats')
export const getActivityStatsSummary = () => api.get('/activity/stats-summary')
export const getActivityStatsCharts = () => api.get('/activity/stats-charts')
export const getActivityDashboardTable = (params) => api.get('/activity/dashboard-table', { params })

// 報名
export const getRegistrations = (params) => api.get('/activity/registrations', { params })

// 審核工作流：公開報名靜默比對不到在校生時進入待審核佇列，由校方人工處理
export const listPendingRegistrations = (params) =>
  api.get('/activity/registrations/pending', { params })
export const matchRegistration = (id, studentId) =>
  api.post(`/activity/registrations/${id}/match`, { student_id: studentId })
export const rejectRegistration = (id, reason = '') =>
  api.post(`/activity/registrations/${id}/reject`, { reason })
export const rematchRegistration = (id, data = {}) =>
  api.post(`/activity/registrations/${id}/rematch`, data)
export const forceAcceptRegistration = (id, data = {}) =>
  api.post(`/activity/registrations/${id}/force-accept`, data)
export const restoreRegistration = (id) =>
  api.post(`/activity/registrations/${id}/restore`)
export const searchActivityStudents = (q, limit = 20) =>
  api.get('/activity/students/search', { params: { q, limit } })
export const createRegistration = (data) => api.post('/activity/registrations', data)
export const updateRegistrationBasic = (id, data) =>
  api.put(`/activity/registrations/${id}`, data)
export const addRegistrationCourse = (id, courseId) =>
  api.post(`/activity/registrations/${id}/courses`, { course_id: courseId })
export const addRegistrationSupply = (id, supplyId) =>
  api.post(`/activity/registrations/${id}/supplies`, { supply_id: supplyId })
// 移除已報名用品；移除後若會超繳，需 forceRefund=true 並附 refundReason（≥5 字）
// 後端會寫一筆「系統補齊」付款方式的退費沖帳紀錄。
export const removeRegistrationSupply = (
  registrationId,
  supplyRecordId,
  { forceRefund = false, refundReason } = {},
) =>
  api.delete(`/activity/registrations/${registrationId}/supplies/${supplyRecordId}`, {
    params: buildForceRefundParams({ forceRefund, refundReason }),
  })
export const getRegistrationDetail = (id) => api.get(`/activity/registrations/${id}`)
export const updateRemark = (id, data) => api.put(`/activity/registrations/${id}/remark`, data)
export const promoteWaitlist = (registrationId, courseId) =>
  api.put(`/activity/registrations/${registrationId}/waitlist`, null, { params: { course_id: courseId } })
export const sweepExpiredWaitlist = () =>
  api.post('/activity/waitlist/sweep-expired')
// 退課 / 刪除報名 / 移除用品在「移除後仍有已繳金額」時，後端會回 409；
// 前端二次確認後需帶 force_refund=true 觸發自動沖帳，且必填 refund_reason（≥5 字）。
function buildForceRefundParams({ forceRefund = false, refundReason } = {}) {
  if (!forceRefund) return {}
  const params = { force_refund: true }
  if (refundReason != null && String(refundReason).length > 0) {
    params.refund_reason = refundReason
  }
  return params
}

export const withdrawCourse = (
  registrationId,
  courseId,
  { forceRefund = false, refundReason } = {},
) =>
  api.delete(`/activity/registrations/${registrationId}/courses/${courseId}`, {
    params: buildForceRefundParams({ forceRefund, refundReason }),
  })
export const deleteRegistration = (id, { forceRefund = false, refundReason } = {}) =>
  api.delete(`/activity/registrations/${id}`, {
    params: buildForceRefundParams({ forceRefund, refundReason }),
  })
// 批次標記「已繳費」（is_paid=true）— 後端已禁用 is_paid=false 批次沖帳以防誤操作
// reason ≥ 5 字必填；整批 shortfall 合計 > NT$1000 需 ACTIVITY_PAYMENT_APPROVE 權限
export const batchUpdatePayment = (ids, reason) =>
  api.put('/activity/registrations/batch-payment', { ids, is_paid: true, reason })
// 更新付款狀態（單筆）：
// payload 視 is_paid 而異：
// - is_paid=false（沖帳）：必填 confirm_refund_amount (=current_paid) + refund_reason (≥5 字)
// - is_paid=true（補齊欠費）（2026-04-27 守衛）：當 shortfall>0 時必填
//   * payment_method（不可為「系統補齊」，請填現金/轉帳/其他）
//   * payment_reason（≥5 字）
//   * shortfall > NT$1000 需 ACTIVITY_PAYMENT_APPROVE 權限
export const updateRegistrationPayment = (id, payload) =>
  api.put(`/activity/registrations/${id}/payment`, payload)
export const getRegistrationPayments = (id) =>
  api.get(`/activity/registrations/${id}/payments`)
export const addRegistrationPayment = (id, data) =>
  api.post(`/activity/registrations/${id}/payments`, data)
// 軟刪除繳費紀錄（voiding）：需 ACTIVITY_PAYMENT_APPROVE 權限 + reason ≥ 5 字
// 原紀錄仍保留於 DB（voided_at/by/reason 欄位），不計入 paid_amount / 日結
export const deleteRegistrationPayment = (registrationId, paymentId, reason) =>
  api.delete(`/activity/registrations/${registrationId}/payments/${paymentId}`, {
    data: { reason },
  })
export const exportRegistrations = (params) =>
  api.get('/activity/registrations/export', { params, responseType: 'blob' })

// 課程
export const getCourses = (params = {}) => api.get('/activity/courses', { params })
export const getCourseDetail = (id) => api.get(`/activity/courses/${id}`)
export const getCourseWaitlist = (courseId) => api.get(`/activity/courses/${courseId}/waitlist`)
export const getCourseEnrolled = (courseId) => api.get(`/activity/courses/${courseId}/enrolled`)
export const createCourse = (data) => api.post('/activity/courses', data)
export const updateCourse = (id, data) => api.put(`/activity/courses/${id}`, data)
export const deleteCourse = (id) => api.delete(`/activity/courses/${id}`)
export const copyCoursesFromPrevious = (payload) =>
  api.post('/activity/courses/copy-from-previous', payload)

// 用品
export const getSupplies = (params = {}) => api.get('/activity/supplies', { params })
export const createSupply = (data) => api.post('/activity/supplies', data)
export const updateSupply = (id, data) => api.put(`/activity/supplies/${id}`, data)
export const deleteSupply = (id) => api.delete(`/activity/supplies/${id}`)

// 家長提問
export const getInquiries = (params) => api.get('/activity/inquiries', { params })
export const markInquiryRead = (id) => api.put(`/activity/inquiries/${id}/read`)
export const replyInquiry = (id, data) => api.put(`/activity/inquiries/${id}/reply`, data)
export const deleteInquiry = (id) => api.delete(`/activity/inquiries/${id}`)

// 報名時間設定
export const getRegistrationTime = () => api.get('/activity/settings/registration-time')
export const updateRegistrationTime = (data) => api.post('/activity/settings/registration-time', data)

// 海報上傳（multipart）
export const uploadActivityPoster = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/activity/settings/poster', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// 修改紀錄
export const getChanges = (params) => api.get('/activity/changes', { params })

// 班級選項
export const getClassOptions = () => api.get('/activity/class-options')

// 統計表匯出
export const exportDashboardTable = (params) =>
  api.get('/activity/dashboard-table/export', { params, responseType: 'blob' })

// POS 收銀
export const getPOSOutstandingByStudent = (q, limit = 100, opts = {}) => {
  const params = { limit, ...opts }
  const keyword = (q || '').trim()
  if (keyword) params.q = keyword
  return api.get('/activity/pos/outstanding-by-student', { params })
}
export const posCheckout = (payload) => api.post('/activity/pos/checkout', payload)
export const getPOSDailySummary = (date) =>
  api.get('/activity/pos/daily-summary', { params: date ? { date } : {} })
export const getPOSRecentTransactions = (params = {}) =>
  api.get('/activity/pos/recent-transactions', { params })

// POS 日結簽核（老闆核對每日流水）
export const getPOSDailyClosePending = (params = {}) =>
  api.get('/activity/pos/daily-close/pending', { params })
export const getPOSDailyCloseStatus = (dateStr) =>
  api.get(`/activity/pos/daily-close/${dateStr}`)
export const approvePOSDailyClose = (dateStr, payload = {}) =>
  api.post(`/activity/pos/daily-close/${dateStr}`, payload)
// 解鎖日結：reason ≥ 10 字必填；原 snapshot 摘要會寫進 ApprovalLog 稽核軌跡
export const unlockPOSDailyClose = (dateStr, reason) =>
  api.delete(`/activity/pos/daily-close/${dateStr}`, { data: { reason } })
export const getPOSReconciliation = (startDate, endDate) =>
  api.get('/activity/pos/reconciliation', {
    params: { start_date: startDate, end_date: endDate },
  })
export const getPOSSemesterReconciliation = (params = {}) =>
  api.get('/activity/pos/semester-reconciliation', { params })

// Portal - 才藝查詢
export const getPortalActivityRegistrations = () =>
  api.get('/portal/activity/registrations')

// 管理端 - 才藝點名
export const getAttendanceSessions = (params) =>
  api.get('/activity/attendance/sessions', { params })
export const createAttendanceSession = (data) =>
  api.post('/activity/attendance/sessions', data)
export const deleteAttendanceSession = (id) =>
  api.delete(`/activity/attendance/sessions/${id}`)
export const getAttendanceSession = (id, params = {}) =>
  api.get(`/activity/attendance/sessions/${id}`, { params })
export const batchUpdateAttendance = (id, records) =>
  api.put(`/activity/attendance/sessions/${id}/records`, { records })

export const exportAttendanceSession = (id) =>
  api.get(`/activity/attendance/sessions/${id}/export`, { responseType: 'blob' })

// Portal - 才藝點名
export const getPortalAttendanceSessions = (params) =>
  api.get('/portal/activity/attendance/sessions', { params })
export const getPortalAttendanceSession = (id, params = {}) =>
  api.get(`/portal/activity/attendance/sessions/${id}`, { params })
export const batchUpdatePortalAttendance = (id, records) =>
  api.put(`/portal/activity/attendance/sessions/${id}/records`, { records })
