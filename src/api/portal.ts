import api from './index'

// ----- 通知 -----
export const getUnreadCount = () => api.get('/portal/unread-count')

export const getSwapPendingCount = () => api.get('/portal/swap-pending-count')

export const getSubstitutePendingCount = () => api.get('/portal/substitute-pending-count')

// ----- 個人資料 -----
export const getProfile = () => api.get('/portal/profile')

export const updateProfile = (data: unknown) => api.put('/portal/profile', data)

// ----- 考勤 -----
export const getAttendanceSheet = (params: unknown) =>
  api.get('/portal/attendance-sheet', { params })
export const getAttendanceSheetPdf = (params: unknown) =>
  api.get('/portal/attendance-sheet.pdf', { params, responseType: 'blob' })

// ----- 行事曆 -----
export const getCalendar = (params: unknown) => api.get('/portal/calendar', { params })

// ----- 學生 -----
export const getMyStudents = () => api.get('/portal/my-students')

export const getPortalStudentDetail = (studentId: number) =>
  api.get(`/portal/students/${studentId}/detail`)

export const revealPortalStudentPhone = (studentId: number, payload: unknown) =>
  api.post(`/portal/students/${studentId}/reveal-phone`, payload)

// ----- 學生點名 -----
export const getMyClassAttendance = (params: unknown) =>
  api.get('/portal/my-class-attendance', { params })

export const batchSaveClassAttendance = (data: unknown) =>
  api.post('/portal/class-attendance/batch', data)

export const getMyClassAttendanceMonthly = (params: unknown) =>
  api.get('/portal/my-class-attendance/monthly', { params })

export const exportMyClassAttendance = (params: unknown) =>
  api.get('/portal/my-class-attendance/export', { params, responseType: 'blob' })

// ----- 異常 -----
export const getAnomalies = (params: unknown) => api.get('/portal/anomalies', { params })

export const confirmAnomaly = (id: number, action: string) =>
  api.post(`/portal/anomalies/${id}/confirm`, { action })

// ----- 薪資 -----
export const getSalaryPreview = (params: unknown) =>
  api.get('/portal/salary-preview', { params })

// ----- 公告 -----
export const getPortalAnnouncements = (params: unknown) =>
  api.get('/portal/announcements', { params })

export const markAnnouncementRead = (id: number) =>
  api.post(`/portal/announcements/${id}/read`)

// ----- 請假 -----
export const getMyLeaves = (params: unknown) => api.get('/portal/my-leaves', { params })

export const createMyLeave = (data: unknown) => api.post('/portal/my-leaves', data)

export const uploadMyLeaveAttachments = (leaveId: number, formData: FormData) =>
  api.post(`/portal/my-leaves/${leaveId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const getMyLeaveAttachment = (leaveId: number, filename: string) =>
  api.get(`/portal/my-leaves/${leaveId}/attachments/${filename}`, {
    responseType: 'blob',
  })

export const getMyQuotas = (params: unknown) => api.get('/portal/my-quotas', { params })

export const getMyLeaveStats = () => api.get('/portal/my-leave-stats')

export const getMyWorkdayHours = (params: unknown) =>
  api.get('/portal/my-workday-hours', { params })

// ----- 加班 -----
export const getMyOvertimes = (params: unknown) =>
  api.get('/portal/my-overtimes', { params })

export const createMyOvertime = (data: unknown) => api.post('/portal/my-overtimes', data)

export const deleteMyOvertime = (id: number) => api.delete(`/portal/my-overtimes/${id}`)

// ----- 補打卡 -----
export const getMyPunchCorrections = (params: unknown) =>
  api.get('/portal/my-punch-corrections', { params })

export const createMyPunchCorrection = (data: unknown) =>
  api.post('/portal/my-punch-corrections', data)

// ----- 排班 -----
export const getMySchedule = (params: unknown) => api.get('/portal/my-schedule', { params })

export const getSwapRequests = () => api.get('/portal/swap-requests')

export const getSwapCandidates = (params: unknown) =>
  api.get('/portal/swap-candidates', { params })

export const createSwapRequest = (data: unknown) => api.post('/portal/swap-requests', data)

export const respondToSwap = (id: number, action: string) =>
  api.post(`/portal/swap-requests/${id}/respond`, { action })

export const cancelSwapRequest = (id: number) =>
  api.post(`/portal/swap-requests/${id}/cancel`)

// ----- 職務代理人 -----
export const respondToSubstitute = (leaveId: number, data: unknown) =>
  api.post(`/portal/my-leaves/${leaveId}/substitute-respond`, data)

export const getMySubstituteRequests = (params: unknown) =>
  api.get('/portal/my-substitute-requests', { params })
