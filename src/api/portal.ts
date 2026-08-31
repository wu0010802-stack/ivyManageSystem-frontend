import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// ----- 通知 -----
export const getUnreadCount = (): AxiosResp<'/portal/unread-count', 'get'> =>
  api.get('/portal/unread-count')

export const getSwapPendingCount = (): AxiosResp<'/portal/swap-pending-count', 'get'> =>
  api.get('/portal/swap-pending-count')

export const getSubstitutePendingCount = (): AxiosResp<'/portal/substitute-pending-count', 'get'> =>
  api.get('/portal/substitute-pending-count')

// ----- 個人資料 -----
export const getProfile = (): AxiosResp<'/portal/profile', 'get'> =>
  api.get('/portal/profile')

export const updateProfile = (
  data: ApiBody<'/portal/profile', 'put'>,
): AxiosResp<'/portal/profile', 'put'> => api.put('/portal/profile', data)

// ----- 考勤 -----
export const getAttendanceSheet = (
  params: ApiQuery<'/portal/attendance-sheet', 'get'>,
): AxiosResp<'/portal/attendance-sheet', 'get'> =>
  api.get('/portal/attendance-sheet', { params })

export const getAttendanceSheetPdf = (
  params: ApiQuery<'/portal/attendance-sheet.pdf', 'get'>,
) => api.get('/portal/attendance-sheet.pdf', { params, responseType: 'blob' })

// ----- 行事曆 -----
export const getCalendar = (
  params: ApiQuery<'/portal/calendar', 'get'>,
): AxiosResp<'/portal/calendar', 'get'> => api.get('/portal/calendar', { params })

// ----- 學生 -----
export const getMyStudents = (
  params?: ApiQuery<'/portal/my-students', 'get'>,
): AxiosResp<'/portal/my-students', 'get'> => api.get('/portal/my-students', { params })

export const getPortalStudentDetail = (
  studentId: number,
): AxiosResp<'/portal/students/{student_id}/detail', 'get'> =>
  api.get(`/portal/students/${studentId}/detail`)

export const revealPortalStudentPhone = (
  studentId: number,
  payload: ApiBody<'/portal/students/{student_id}/reveal-phone', 'post'>,
): AxiosResp<'/portal/students/{student_id}/reveal-phone', 'post'> =>
  api.post(`/portal/students/${studentId}/reveal-phone`, payload)

// ----- 學生點名 -----
export const getMyClassAttendance = (
  params: ApiQuery<'/portal/my-class-attendance', 'get'>,
): AxiosResp<'/portal/my-class-attendance', 'get'> =>
  api.get('/portal/my-class-attendance', { params })

export const batchSaveClassAttendance = (
  data: ApiBody<'/portal/class-attendance/batch', 'post'>,
): AxiosResp<'/portal/class-attendance/batch', 'post'> =>
  api.post('/portal/class-attendance/batch', data)

export const getMyClassAttendanceMonthly = (
  params: ApiQuery<'/portal/my-class-attendance/monthly', 'get'>,
): AxiosResp<'/portal/my-class-attendance/monthly', 'get'> =>
  api.get('/portal/my-class-attendance/monthly', { params })

// ----- 異常 -----
export const getAnomalies = (
  params: ApiQuery<'/portal/anomalies', 'get'>,
): AxiosResp<'/portal/anomalies', 'get'> => api.get('/portal/anomalies', { params })

// remark：申訴理由。後端 AnomalyConfirm 早就收這個欄位（寫成「 [申訴: {remark}]」），
// 只在有值時放進 body，避免對既有的 accept / use_pto 呼叫端造成 payload 變化。
export const confirmAnomaly = (
  id: number,
  action: string,
  remark?: string,
  anomalyType?: string,
): AxiosResp<'/portal/anomalies/{attendance_id}/confirm', 'post'> =>
  api.post(`/portal/anomalies/${id}/confirm`, {
    action,
    ...(remark ? { remark } : {}),
    // 確認粒度為「逐異常項目」：同一天最多 4 項，不帶會讓後端只認預設的 late
    ...(anomalyType ? { anomaly_type: anomalyType } : {}),
  })

// ----- 薪資 -----
export const getSalaryPreview = (
  params: ApiQuery<'/portal/salary-preview', 'get'>,
): AxiosResp<'/portal/salary-preview', 'get'> =>
  api.get('/portal/salary-preview', { params })

// ----- 公告 -----
export const getPortalAnnouncements = (
  params?: ApiQuery<'/portal/announcements', 'get'>,
): AxiosResp<'/portal/announcements', 'get'> =>
  api.get('/portal/announcements', { params })

export const markAnnouncementRead = (
  id: number,
): AxiosResp<'/portal/announcements/{announcement_id}/read', 'post'> =>
  api.post(`/portal/announcements/${id}/read`)

// ----- 請假 -----
export const getMyLeaves = (
  params: ApiQuery<'/portal/my-leaves', 'get'>,
): AxiosResp<'/portal/my-leaves', 'get'> => api.get('/portal/my-leaves', { params })

export const createMyLeave = (
  data: ApiBody<'/portal/my-leaves', 'post'>,
): AxiosResp<'/portal/my-leaves', 'post'> => api.post('/portal/my-leaves', data)

// 教師自撤本人「待審核」假單（後端僅開放 pending + 本人；已核准/駁回回 409）
export const cancelMyLeave = (
  leaveId: number,
): AxiosResp<'/leaves/{leave_id}/cancel', 'post'> =>
  api.post(`/leaves/${leaveId}/cancel`)

export const uploadMyLeaveAttachments = (leaveId: number, formData: FormData) =>
  api.post(`/portal/my-leaves/${leaveId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const getMyLeaveAttachment = (leaveId: number, filename: string) =>
  api.get(`/portal/my-leaves/${leaveId}/attachments/${filename}`, {
    responseType: 'blob',
  })

export const getMyQuotas = (
  params?: ApiQuery<'/portal/my-quotas', 'get'>,
): AxiosResp<'/portal/my-quotas', 'get'> => api.get('/portal/my-quotas', { params })

export const getMyLeaveStats = (): AxiosResp<'/portal/my-leave-stats', 'get'> =>
  api.get('/portal/my-leave-stats')

export const getMyWorkdayHours = (
  params: ApiQuery<'/portal/my-workday-hours', 'get'>,
): AxiosResp<'/portal/my-workday-hours', 'get'> =>
  api.get('/portal/my-workday-hours', { params })

// ----- 加班 -----
export const getMyOvertimes = (
  params: ApiQuery<'/portal/my-overtimes', 'get'>,
): AxiosResp<'/portal/my-overtimes', 'get'> =>
  api.get('/portal/my-overtimes', { params })

export const createMyOvertime = (
  data: ApiBody<'/portal/my-overtimes', 'post'>,
): AxiosResp<'/portal/my-overtimes', 'post'> => api.post('/portal/my-overtimes', data)

export const deleteMyOvertime = (
  id: number,
): AxiosResp<'/portal/my-overtimes/{overtime_id}', 'delete'> =>
  api.delete(`/portal/my-overtimes/${id}`)

// ----- 補打卡 -----
export const getMyPunchCorrections = (
  params?: ApiQuery<'/portal/my-punch-corrections', 'get'>,
): AxiosResp<'/portal/my-punch-corrections', 'get'> =>
  api.get('/portal/my-punch-corrections', { params })

export const createMyPunchCorrection = (
  data: ApiBody<'/portal/my-punch-corrections', 'post'>,
): AxiosResp<'/portal/my-punch-corrections', 'post'> =>
  api.post('/portal/my-punch-corrections', data)

// ----- 排班 -----
export const getMySchedule = (
  params: ApiQuery<'/portal/my-schedule', 'get'>,
): AxiosResp<'/portal/my-schedule', 'get'> => api.get('/portal/my-schedule', { params })

export const getSwapRequests = (): AxiosResp<'/portal/swap-requests', 'get'> =>
  api.get('/portal/swap-requests')

export const getSwapCandidates = (
  params: ApiQuery<'/portal/swap-candidates', 'get'>,
): AxiosResp<'/portal/swap-candidates', 'get'> =>
  api.get('/portal/swap-candidates', { params })

export const createSwapRequest = (
  data: ApiBody<'/portal/swap-requests', 'post'>,
): AxiosResp<'/portal/swap-requests', 'post'> => api.post('/portal/swap-requests', data)

export const respondToSwap = (
  id: number,
  action: string,
): AxiosResp<'/portal/swap-requests/{request_id}/respond', 'post'> =>
  api.post(`/portal/swap-requests/${id}/respond`, { action })

export const cancelSwapRequest = (
  id: number,
): AxiosResp<'/portal/swap-requests/{request_id}/cancel', 'post'> =>
  api.post(`/portal/swap-requests/${id}/cancel`)

// ----- 職務代理人 -----
export const respondToSubstitute = (
  leaveId: number,
  data: ApiBody<'/portal/my-leaves/{leave_id}/substitute-respond', 'post'>,
): AxiosResp<'/portal/my-leaves/{leave_id}/substitute-respond', 'post'> =>
  api.post(`/portal/my-leaves/${leaveId}/substitute-respond`, data)

export const getMySubstituteRequests = (
  params?: ApiQuery<'/portal/my-substitute-requests', 'get'>,
): AxiosResp<'/portal/my-substitute-requests', 'get'> =>
  api.get('/portal/my-substitute-requests', { params })

// ----- 打卡 PIN -----

/** 教師自助設定打卡 PIN（僅需傳新 PIN；後端以 JWT 身分識別，不需傳舊 PIN） */
export const setPunchPin = (
  data: ApiBody<'/portal/me/punch-pin', 'put'>,
): AxiosResp<'/portal/me/punch-pin', 'put'> =>
  api.put('/portal/me/punch-pin', data)

/** 在職同事清單（請假表單的職務代理人下拉用）。
 *  教師端專用：先前走管理端 GET /employees 需要 EMPLOYEES_READ，教師一定 403，
 *  代理人下拉因此永遠空白。 */
export const getMyColleagues = (): AxiosResp<'/portal/colleagues', 'get'> =>
  api.get('/portal/colleagues')

// ----- 臨時接送授權 -----
export const getPortalPickupAuthorizations = (): AxiosResp<
  '/portal/pickup-authorizations', 'get'
> => api.get('/portal/pickup-authorizations')

export const getPortalPickupPendingCount = (): AxiosResp<
  '/portal/pickup-authorizations/pending-count', 'get'
> => api.get('/portal/pickup-authorizations/pending-count')

export const verifyPickupAuthorization = (
  authId: number,
  data: ApiBody<'/portal/pickup-authorizations/{auth_id}/verify', 'post'>,
): AxiosResp<'/portal/pickup-authorizations/{auth_id}/verify', 'post'> =>
  api.post(`/portal/pickup-authorizations/${authId}/verify`, data)

export const overridePickupAuthorization = (
  authId: number,
  data: ApiBody<'/portal/pickup-authorizations/{auth_id}/override-complete', 'post'>,
): AxiosResp<'/portal/pickup-authorizations/{auth_id}/override-complete', 'post'> =>
  api.post(`/portal/pickup-authorizations/${authId}/override-complete`, data)
