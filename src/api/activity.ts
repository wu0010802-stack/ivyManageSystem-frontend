import api from './index'
import type { AxiosResponse } from 'axios'
import type { ApiQuery, ApiBody, AxiosResp, Schema } from './_generated/typed'

// 統計
// 學期參數契約：與 dashboard-table 完全相同的帶法（school_year/semester query，
// 皆不傳時後端使用當前學期），stats / stats-summary / stats-charts 比照。
// 出席率統計沒有獨立端點：在 GET /activity/stats 聚合回應的頂層 key attendance_stats。
export interface ActivityTermParams {
  school_year?: number
  semester?: number
}
export const getActivityStats = (params: ActivityTermParams = {}): AxiosResp<'/activity/stats', 'get'> =>
  api.get('/activity/stats', { params })
export const getActivityStatsSummary = (params: ActivityTermParams = {}): AxiosResp<'/activity/stats-summary', 'get'> =>
  api.get('/activity/stats-summary', { params })
export const getActivityStatsCharts = (params: ActivityTermParams = {}): AxiosResp<'/activity/stats-charts', 'get'> =>
  api.get('/activity/stats-charts', { params })
export const getActivityDashboardTable = (params?: ApiQuery<'/activity/dashboard-table', 'get'>): AxiosResp<'/activity/dashboard-table', 'get'> =>
  api.get('/activity/dashboard-table', { params })

// 報名
export const getRegistrations = (params?: ApiQuery<'/activity/registrations', 'get'>): AxiosResp<'/activity/registrations', 'get'> =>
  api.get('/activity/registrations', { params })

// 審核工作流：公開報名靜默比對不到在校生時進入待審核佇列，由校方人工處理
export const listPendingRegistrations = (params?: ApiQuery<'/activity/registrations/pending', 'get'>): AxiosResp<'/activity/registrations/pending', 'get'> =>
  api.get('/activity/registrations/pending', { params })
export const matchRegistration = (id: number, studentId: number): AxiosResp<'/activity/registrations/{registration_id}/match', 'post'> =>
  api.post(`/activity/registrations/${id}/match`, { student_id: studentId })
// 2026-07-31 拒絕擴大涵蓋：後台唯一移除入口（「刪除」鍵已移除）。已繳費的報名
// 後端回 409，需二次確認帶 forceRefund + refundReason（≥15 字）重送以自動沖帳。
export const rejectRegistration = (
  id: number,
  reason = '',
  opts?: { forceRefund?: boolean; refundReason?: string },
): AxiosResp<'/activity/registrations/{registration_id}/reject', 'post'> =>
  api.post(`/activity/registrations/${id}/reject`, {
    reason,
    force_refund: opts?.forceRefund ?? false,
    refund_reason: opts?.refundReason,
  })
// rematch / force-accept 後端 body 為 Optional[RegistrationRematchRequest]=None
// （optional requestBody → ApiBody 推導為 never），故直接引用具名 component schema。
export const rematchRegistration = (id: number, data?: Schema<'RegistrationRematchRequest'>): AxiosResp<'/activity/registrations/{registration_id}/rematch', 'post'> =>
  api.post(`/activity/registrations/${id}/rematch`, data)
// 批次重新比對目前學期所有待審核報名（工具列一鍵「重新比對」，2026-07-23）；
// 不傳 params 時後端用當前學期。取代原本需先勾選才觸發、且僅處理已勾選/已載入
// 列的前端迴圈版「批量重新比對」。
export const rematchAllPendingRegistrations = (params?: ApiQuery<'/activity/registrations/rematch-batch', 'post'>): AxiosResp<'/activity/registrations/rematch-batch', 'post'> =>
  api.post('/activity/registrations/rematch-batch', null, { params })
export const forceAcceptRegistration = (id: number, data?: Schema<'RegistrationRematchRequest'>): AxiosResp<'/activity/registrations/{registration_id}/force-accept', 'post'> =>
  api.post(`/activity/registrations/${id}/force-accept`, data)
export const restoreRegistration = (id: number): AxiosResp<'/activity/registrations/{registration_id}/restore', 'post'> =>
  api.post(`/activity/registrations/${id}/restore`)
export const searchActivityStudents = (q: string, limit = 20): AxiosResp<'/activity/students/search', 'get'> =>
  api.get('/activity/students/search', { params: { q, limit } })
export const createRegistration = (data: ApiBody<'/activity/registrations', 'post'>): AxiosResp<'/activity/registrations', 'post'> =>
  api.post('/activity/registrations', data)
export const updateRegistrationBasic = (id: number, data: ApiBody<'/activity/registrations/{registration_id}', 'put'>): AxiosResp<'/activity/registrations/{registration_id}', 'put'> =>
  api.put(`/activity/registrations/${id}`, data)
export const addRegistrationCourse = (id: number, courseId: number): AxiosResp<'/activity/registrations/{registration_id}/courses', 'post'> =>
  api.post(`/activity/registrations/${id}/courses`, { course_id: courseId })
export const addRegistrationSupply = (id: number, supplyId: number): AxiosResp<'/activity/registrations/{registration_id}/supplies', 'post'> =>
  api.post(`/activity/registrations/${id}/supplies`, { supply_id: supplyId })
// 移除已報名用品；移除後若會超繳，需 forceRefund=true 並附 refundReason（≥5 字）
// 後端會寫一筆「系統補齊」付款方式的退費沖帳紀錄。
export const removeRegistrationSupply = (
  registrationId: number,
  supplyRecordId: number,
  { forceRefund = false, refundReason }: { forceRefund?: boolean; refundReason?: string } = {},
): AxiosResp<'/activity/registrations/{registration_id}/supplies/{supply_record_id}', 'delete'> =>
  api.delete(`/activity/registrations/${registrationId}/supplies/${supplyRecordId}`, {
    params: buildForceRefundParams({ forceRefund, refundReason }),
  })
// staff 可唯讀查詢 inactive/rejected 歷史列；is_active 已由 OpenAPI 明確保證。
export const getRegistrationDetail = (id: number): AxiosResp<'/activity/registrations/{registration_id}', 'get'> =>
  api.get(`/activity/registrations/${id}`)
export const updateRemark = (id: number, data: ApiBody<'/activity/registrations/{registration_id}/remark', 'put'>): AxiosResp<'/activity/registrations/{registration_id}/remark', 'put'> =>
  api.put(`/activity/registrations/${id}/remark`, data)
export const promoteWaitlist = (registrationId: number, courseId: number): AxiosResp<'/activity/registrations/{registration_id}/waitlist', 'put'> =>
  api.put(`/activity/registrations/${registrationId}/waitlist`, null, { params: { course_id: courseId } })
export const sweepExpiredWaitlist = (): AxiosResp<'/activity/waitlist/sweep-expired', 'post'> =>
  api.post('/activity/waitlist/sweep-expired')
// 退課 / 刪除報名 / 移除用品在「移除後仍有已繳金額」時，後端會回 409；
// 前端二次確認後需帶 force_refund=true 觸發自動沖帳，且必填 refund_reason（≥5 字）。
function buildForceRefundParams({ forceRefund = false, refundReason }: { forceRefund?: boolean; refundReason?: string } = {}) {
  if (!forceRefund) return {}
  const params: Record<string, unknown> = { force_refund: true }
  if (refundReason != null && String(refundReason).length > 0) {
    params.refund_reason = refundReason
  }
  return params
}

export const withdrawCourse = (
  registrationId: number,
  courseId: number,
  { forceRefund = false, refundReason }: { forceRefund?: boolean; refundReason?: string } = {},
): AxiosResp<'/activity/registrations/{registration_id}/courses/{course_id}', 'delete'> =>
  api.delete(`/activity/registrations/${registrationId}/courses/${courseId}`, {
    params: buildForceRefundParams({ forceRefund, refundReason }),
  })
// deleteRegistration 已移除（2026-07-31）：後台不再提供「刪除」操作，一律走
// rejectRegistration（同為軟刪除、留審核軌跡、可復原）；後端 DELETE 端點保留
// 供 API 相容，但 UI 不得再呼叫。
// 批次標記「已繳費」（is_paid=true）— 後端已禁用 is_paid=false 批次沖帳以防誤操作
// reason ≥ 5 字必填；整批 shortfall 合計 > NT$1000 需 ACTIVITY_PAYMENT_APPROVE 權限
// 資安（2026-07-30 #3）：帶上呼叫端目前檢視的學期（school_year/semester）——
// 切換學期的載入窗口內殘留勾選可能夾帶上一學期的報名 ID；後端驗證整批同屬此學期，
// 不符即回 409（見 schemas/activity_admin.py BatchPaymentUpdate 註解）。選填以保留
// 既有呼叫端相容。
export const batchUpdatePayment = (
  ids: number[],
  reason: string,
  term: { school_year?: number; semester?: number } = {},
): AxiosResp<'/activity/registrations/batch-payment', 'put'> =>
  api.put('/activity/registrations/batch-payment', {
    ids,
    is_paid: true,
    reason,
    school_year: term.school_year,
    semester: term.semester,
  })
// 更新付款狀態（單筆）：
// payload 視 is_paid 而異：
// - is_paid=false（沖帳）：必填 confirm_refund_amount (=current_paid) + refund_reason (≥5 字)
// - is_paid=true（補齊欠費）（2026-04-27 守衛）：當 shortfall>0 時必填
//   * payment_method（不可為「系統補齊」，請填現金/轉帳/其他）
//   * payment_reason（≥5 字）
//   * shortfall > NT$1000 需 ACTIVITY_PAYMENT_APPROVE 權限
export const updateRegistrationPayment = (id: number, payload: ApiBody<'/activity/registrations/{registration_id}/payment', 'put'>): AxiosResp<'/activity/registrations/{registration_id}/payment', 'put'> =>
  api.put(`/activity/registrations/${id}/payment`, payload)
export const getRegistrationPayments = (id: number): AxiosResp<'/activity/registrations/{registration_id}/payments', 'get'> =>
  api.get(`/activity/registrations/${id}/payments`)
// 退費建議（按出席堂數三段比例）：POS / 退費 UI 在退費前預載建議值，避免預填全額
// 已繳而超退（2026-06-29 audit P2-B）。每門 course / 每筆 supply 分開列出。
export const getRefundSuggestion = (id: number): AxiosResp<'/activity/registrations/{registration_id}/refund-suggestion', 'get'> =>
  api.get(`/activity/registrations/${id}/refund-suggestion`)
export const addRegistrationPayment = (id: number, data: ApiBody<'/activity/registrations/{registration_id}/payments', 'post'>): AxiosResp<'/activity/registrations/{registration_id}/payments', 'post'> =>
  api.post(`/activity/registrations/${id}/payments`, data)
// 軟刪除繳費紀錄（voiding）：需 ACTIVITY_PAYMENT_APPROVE 權限 + reason ≥ 5 字
// 原紀錄仍保留於 DB（voided_at/by/reason 欄位），不計入 paid_amount / 日結
export const deleteRegistrationPayment = (registrationId: number, paymentId: number, reason: string): AxiosResp<'/activity/registrations/{registration_id}/payments/{payment_id}', 'delete'> =>
  api.delete(`/activity/registrations/${registrationId}/payments/${paymentId}`, {
    data: { reason },
  })

export const exportRegistrations = (params?: ApiQuery<'/activity/registrations/export', 'get'>): Promise<AxiosResponse<Blob>> =>
  api.get('/activity/registrations/export', { params, responseType: 'blob' })
// 繳費帳務報表（繳費總覽＋繳費明細兩工作表）；端點無 match_status 參數
export const exportPaymentReport = (params?: ApiQuery<'/activity/registrations/payment-report', 'get'>): Promise<AxiosResponse<Blob>> =>
  api.get('/activity/registrations/payment-report', { params, responseType: 'blob' })

// 課程
export const getCourses = (params?: ApiQuery<'/activity/courses', 'get'>): AxiosResp<'/activity/courses', 'get'> =>
  api.get('/activity/courses', { params })
export const getCourseDetail = (id: number): AxiosResp<'/activity/courses/{course_id}', 'get'> =>
  api.get(`/activity/courses/${id}`)
export const getCourseWaitlist = (courseId: number): AxiosResp<'/activity/courses/{course_id}/waitlist', 'get'> =>
  api.get(`/activity/courses/${courseId}/waitlist`)
// URL 為向下相容仍叫 /enrolled，但 response 已是「容量佔位名單」：
// enrolled / promoted_pending / pending_review 三態都會回傳。
export type ActivityCourseOccupancyItem = Schema<'CourseEnrolledItemOut'>
export type ActivityCourseOccupancyStatus = ActivityCourseOccupancyItem['status']
export const getCourseEnrolled = (courseId: number): AxiosResp<'/activity/courses/{course_id}/enrolled', 'get'> =>
  api.get(`/activity/courses/${courseId}/enrolled`)
// 容量佔位名單拖拉排序（enrollsort01）：兩區 ids 合併需為當前名單（佔位＋候補）
// course_record_id 的完整排列；跨區移動即身分轉換（候補轉正／正式轉候補，由後端
// 套用狀態轉移與通知）。名單過期（並發報名/退課/審核）回 409，前端應重載後再排
export const reorderCourseEnrolled = (courseId: number, occupyingIds: number[], waitlistIds: number[]): AxiosResp<'/activity/courses/{course_id}/enrolled/order', 'put'> =>
  api.put(`/activity/courses/${courseId}/enrolled/order`, { occupying_ids: occupyingIds, waitlist_ids: waitlistIds })
// 課程顯示排序（actcsort01）：course_ids 需為該學期所有啟用課程的完整排列，
// 決定後台列表與前台（公開報名頁／家長端）的顯示順序。清單過期（並發新增／
// 停用課程）回 409，前端應重載後再排。
export const reorderCourses = (payload: ApiBody<'/activity/courses/order', 'put'>): AxiosResp<'/activity/courses/order', 'put'> =>
  api.put('/activity/courses/order', payload)
export const createCourse = (data: ApiBody<'/activity/courses', 'post'>): AxiosResp<'/activity/courses', 'post'> =>
  api.post('/activity/courses', data)
export const updateCourse = (id: number, data: ApiBody<'/activity/courses/{course_id}', 'put'>): AxiosResp<'/activity/courses/{course_id}', 'put'> =>
  api.put(`/activity/courses/${id}`, data)
export const deleteCourse = (id: number): AxiosResp<'/activity/courses/{course_id}', 'delete'> =>
  api.delete(`/activity/courses/${id}`)
export const copyCoursesFromPrevious = (payload: ApiBody<'/activity/courses/copy-from-previous', 'post'>): AxiosResp<'/activity/courses/copy-from-previous', 'post'> =>
  api.post('/activity/courses/copy-from-previous', payload)

// 用品
export const getSupplies = (params?: ApiQuery<'/activity/supplies', 'get'>): AxiosResp<'/activity/supplies', 'get'> =>
  api.get('/activity/supplies', { params })
export const createSupply = (data: ApiBody<'/activity/supplies', 'post'>): AxiosResp<'/activity/supplies', 'post'> =>
  api.post('/activity/supplies', data)
export const updateSupply = (id: number, data: ApiBody<'/activity/supplies/{supply_id}', 'put'>): AxiosResp<'/activity/supplies/{supply_id}', 'put'> =>
  api.put(`/activity/supplies/${id}`, data)
export const deleteSupply = (id: number): AxiosResp<'/activity/supplies/{supply_id}', 'delete'> =>
  api.delete(`/activity/supplies/${id}`)

// 家長提問
export const getInquiries = (params?: ApiQuery<'/activity/inquiries', 'get'>): AxiosResp<'/activity/inquiries', 'get'> =>
  api.get('/activity/inquiries', { params })
export const markInquiryRead = (id: number): AxiosResp<'/activity/inquiries/{inquiry_id}/read', 'put'> =>
  api.put(`/activity/inquiries/${id}/read`)
export const replyInquiry = (id: number, data: ApiBody<'/activity/inquiries/{inquiry_id}/reply', 'put'>): AxiosResp<'/activity/inquiries/{inquiry_id}/reply', 'put'> =>
  api.put(`/activity/inquiries/${id}/reply`, data)
export const deleteInquiry = (id: number): AxiosResp<'/activity/inquiries/{inquiry_id}', 'delete'> =>
  api.delete(`/activity/inquiries/${id}`)

// 報名時間與四個通知模板欄位皆由 OpenAPI 產生，不再維護手寫交集型別。
export type ActivityRegistrationSettingsPayload = ApiBody<'/activity/settings/registration-time', 'post'>
export const getRegistrationTime = (): AxiosResp<'/activity/settings/registration-time', 'get'> =>
  api.get('/activity/settings/registration-time')
export const updateRegistrationTime = (data: ActivityRegistrationSettingsPayload): AxiosResp<'/activity/settings/registration-time', 'post'> =>
  api.post('/activity/settings/registration-time', data)

// 候補直升正式通知信樣板
export const getWaitlistPromotedEmailTemplate = (): AxiosResp<'/activity/settings/waitlist-promoted-email', 'get'> =>
  api.get('/activity/settings/waitlist-promoted-email')
export const updateWaitlistPromotedEmailTemplate = (data: ApiBody<'/activity/settings/waitlist-promoted-email', 'put'>): AxiosResp<'/activity/settings/waitlist-promoted-email', 'put'> =>
  api.put('/activity/settings/waitlist-promoted-email', data)
export const testSendWaitlistPromotedEmail = (data: ApiBody<'/activity/settings/waitlist-promoted-email/test-send', 'post'>): AxiosResp<'/activity/settings/waitlist-promoted-email/test-send', 'post'> =>
  api.post('/activity/settings/waitlist-promoted-email/test-send', data)

// 報名成功通知信樣板
export const getRegistrationSuccessEmailTemplate = (): AxiosResp<'/activity/settings/registration-success-email', 'get'> =>
  api.get('/activity/settings/registration-success-email')
export const updateRegistrationSuccessEmailTemplate = (data: ApiBody<'/activity/settings/registration-success-email', 'put'>): AxiosResp<'/activity/settings/registration-success-email', 'put'> =>
  api.put('/activity/settings/registration-success-email', data)
export const testSendRegistrationSuccessEmail = (data: ApiBody<'/activity/settings/registration-success-email/test-send', 'post'>): AxiosResp<'/activity/settings/registration-success-email/test-send', 'post'> =>
  api.post('/activity/settings/registration-success-email/test-send', data)

// 海報上傳（multipart）
export const uploadActivityPoster = (file: File): AxiosResp<'/activity/settings/poster', 'post'> => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/activity/settings/poster', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// 課程 DM（介紹文宣）上傳／刪除（multipart）
export const uploadCourseDm = (
  courseId: number,
  file: File,
): AxiosResp<'/activity/courses/{course_id}/dm', 'post'> => {
  const form = new FormData()
  form.append('file', file)
  return api.post(`/activity/courses/${courseId}/dm`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const deleteCourseDm = (
  courseId: number,
): AxiosResp<'/activity/courses/{course_id}/dm', 'delete'> =>
  api.delete(`/activity/courses/${courseId}/dm`)

// 修改紀錄
export const getChanges = (params?: ApiQuery<'/activity/changes', 'get'>): AxiosResp<'/activity/changes', 'get'> =>
  api.get('/activity/changes', { params })

// 班級選項
export const getClassOptions = (params?: ApiQuery<'/activity/class-options', 'get'>): AxiosResp<'/activity/class-options', 'get'> =>
  api.get('/activity/class-options', { params })

// 統計表匯出
export const exportDashboardTable = (params?: ApiQuery<'/activity/dashboard-table/export', 'get'>): Promise<AxiosResponse<Blob>> =>
  api.get('/activity/dashboard-table/export', { params, responseType: 'blob' })

// POS 收銀
export const getPOSOutstandingByStudent = (q: string, limit = 100, opts: Record<string, unknown> = {}): AxiosResp<'/activity/pos/outstanding-by-student', 'get'> => {
  const params: Record<string, unknown> = { limit, ...opts }
  const keyword = (q || '').trim()
  if (keyword) params.q = keyword
  return api.get('/activity/pos/outstanding-by-student', { params })
}
export const posCheckout = (payload: ApiBody<'/activity/pos/checkout', 'post'>): AxiosResp<'/activity/pos/checkout', 'post'> =>
  api.post('/activity/pos/checkout', payload)
export const getPOSReceiptPdf = (receiptNo: string): Promise<AxiosResponse<Blob>> =>
  api.get(`/activity/pos/receipts/${encodeURIComponent(receiptNo)}/print.pdf`, {
    responseType: 'blob',
  })
export const getPOSDailySummary = (date?: string): AxiosResp<'/activity/pos/daily-summary', 'get'> =>
  api.get('/activity/pos/daily-summary', { params: date ? { date } : {} })
export const getPOSRecentTransactions = (params?: ApiQuery<'/activity/pos/recent-transactions', 'get'>): AxiosResp<'/activity/pos/recent-transactions', 'get'> =>
  api.get('/activity/pos/recent-transactions', { params })

// POS 日結簽核（老闆核對每日流水）
export const getPOSDailyClosePending = (params?: ApiQuery<'/activity/pos/daily-close/pending', 'get'>): AxiosResp<'/activity/pos/daily-close/pending', 'get'> =>
  api.get('/activity/pos/daily-close/pending', { params })
export const getPOSDailyCloseStatus = (dateStr: string): AxiosResp<'/activity/pos/daily-close/{date_str}', 'get'> =>
  api.get(`/activity/pos/daily-close/${dateStr}`)
export const approvePOSDailyClose = (dateStr: string, payload?: ApiBody<'/activity/pos/daily-close/{date_str}', 'post'>): AxiosResp<'/activity/pos/daily-close/{date_str}', 'post'> =>
  api.post(`/activity/pos/daily-close/${dateStr}`, payload)
// 解鎖日結：payload: { reason: string, is_admin_override?: boolean }
// 後端 response: 200 + { close_date, unlocked_at, is_admin_override, notification_delivered }
export const unlockPOSDailyClose = (date: string, payload: ApiBody<'/activity/pos/daily-close/{date_str}', 'delete'>): AxiosResp<'/activity/pos/daily-close/{date_str}', 'delete'> =>
  api.delete(`/activity/pos/daily-close/${date}`, { data: payload })
export const getPOSUnlockEvents = (days = 30): AxiosResp<'/activity/audit/pos-unlock-events', 'get'> =>
  api.get('/activity/audit/pos-unlock-events', { params: { days } })
export const getPOSOperatorActivity = (days = 30): AxiosResp<'/activity/audit/operator-activity', 'get'> =>
  api.get('/activity/audit/operator-activity', { params: { days } })
export const getPOSReconciliation = (startDate: string, endDate: string): AxiosResp<'/activity/pos/reconciliation', 'get'> =>
  api.get('/activity/pos/reconciliation', {
    params: { start_date: startDate, end_date: endDate },
  })
export const getPOSSemesterReconciliation = (params?: ApiQuery<'/activity/pos/semester-reconciliation', 'get'>): AxiosResp<'/activity/pos/semester-reconciliation', 'get'> =>
  api.get('/activity/pos/semester-reconciliation', { params })

// Portal - 才藝查詢
export const getPortalActivityRegistrations = (): AxiosResp<'/portal/activity/registrations', 'get'> =>
  api.get('/portal/activity/registrations')

// 管理端 - 才藝點名
export const getAttendanceSessions = (params?: ApiQuery<'/activity/attendance/sessions', 'get'>): AxiosResp<'/activity/attendance/sessions', 'get'> =>
  api.get('/activity/attendance/sessions', { params })
export const createAttendanceSession = (data: ApiBody<'/activity/attendance/sessions', 'post'>): AxiosResp<'/activity/attendance/sessions', 'post'> =>
  api.post('/activity/attendance/sessions', data)
// 依上課星期在日期範圍批次建場次（取代逐堂手動新增）；weekday 省略則用課程 meeting_weekdays 全部星期
export const createAttendanceSessionsBatch = (data: ApiBody<'/activity/attendance/sessions/batch', 'post'>): AxiosResp<'/activity/attendance/sessions/batch', 'post'> =>
  api.post('/activity/attendance/sessions/batch', data)
export const deleteAttendanceSession = (id: number): AxiosResp<'/activity/attendance/sessions/{session_id}', 'delete'> =>
  api.delete(`/activity/attendance/sessions/${id}`)
export const getAttendanceSession = (id: number, params?: ApiQuery<'/activity/attendance/sessions/{session_id}', 'get'>): AxiosResp<'/activity/attendance/sessions/{session_id}', 'get'> =>
  api.get(`/activity/attendance/sessions/${id}`, { params })
export const batchUpdateAttendance = (id: number, records: ApiBody<'/activity/attendance/sessions/{session_id}/records', 'put'>['records']): AxiosResp<'/activity/attendance/sessions/{session_id}/records', 'put'> =>
  api.put(`/activity/attendance/sessions/${id}/records`, { records })

export const exportAttendanceSession = (id: number): Promise<AxiosResponse<Blob>> =>
  api.get(`/activity/attendance/sessions/${id}/export`, { responseType: 'blob' })

export const getAttendanceSessionRollPdf = (id: number): Promise<AxiosResponse<Blob>> =>
  api.get(`/activity/attendance/sessions/${id}/roll.pdf`, { responseType: 'blob' })

// Portal - 才藝點名
export const getPortalAttendanceSessions = (params?: ApiQuery<'/portal/activity/attendance/sessions', 'get'>): AxiosResp<'/portal/activity/attendance/sessions', 'get'> =>
  api.get('/portal/activity/attendance/sessions', { params })
export const getPortalAttendanceSession = (id: number, params?: ApiQuery<'/portal/activity/attendance/sessions/{session_id}', 'get'>): AxiosResp<'/portal/activity/attendance/sessions/{session_id}', 'get'> =>
  api.get(`/portal/activity/attendance/sessions/${id}`, { params })
export const batchUpdatePortalAttendance = (id: number, records: ApiBody<'/portal/activity/attendance/sessions/{session_id}/records', 'put'>['records']): AxiosResp<'/portal/activity/attendance/sessions/{session_id}/records', 'put'> =>
  api.put(`/portal/activity/attendance/sessions/${id}/records`, { records })
