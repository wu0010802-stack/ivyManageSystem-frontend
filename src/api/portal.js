import api from './index'

// ----- 通知 -----
export const getUnreadCount = () => api.get('/portal/unread-count')

export const getSwapPendingCount = () => api.get('/portal/swap-pending-count')

// ----- 個人資料 -----
export const getProfile = () => api.get('/portal/profile')

export const updateProfile = (data) => api.put('/portal/profile', data)

// ----- 考勤 -----
export const getAttendanceSheet = (params) =>
  api.get('/portal/attendance-sheet', { params })

// ----- 行事曆 -----
export const getCalendar = (params) => api.get('/portal/calendar', { params })

// ----- 學生 -----
export const getMyStudents = () => api.get('/portal/my-students')

// ----- 學生點名 -----
export const getMyClassAttendance = (params) =>
  api.get('/portal/my-class-attendance', { params })

export const batchSaveClassAttendance = (data) =>
  api.post('/portal/class-attendance/batch', data)

export const getMyClassAttendanceMonthly = (params) =>
  api.get('/portal/my-class-attendance/monthly', { params })

export const exportMyClassAttendance = (params) =>
  api.get('/portal/my-class-attendance/export', { params, responseType: 'blob' })

// ----- 異常 -----
export const getAnomalies = (params) => api.get('/portal/anomalies', { params })

export const confirmAnomaly = (id, action) =>
  api.post(`/portal/anomalies/${id}/confirm`, { action })

// ----- 薪資 -----
export const getSalaryPreview = (params) =>
  api.get('/portal/salary-preview', { params })

// ----- 公告 -----
export const getPortalAnnouncements = (params) =>
  api.get('/portal/announcements', { params })

export const markAnnouncementRead = (id) =>
  api.post(`/portal/announcements/${id}/read`)

// ----- 請假 -----
export const getMyLeaves = (params) => api.get('/portal/my-leaves', { params })

export const createMyLeave = (data) => api.post('/portal/my-leaves', data)

export const uploadMyLeaveAttachments = (leaveId, formData) =>
  api.post(`/portal/my-leaves/${leaveId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const getMyLeaveAttachment = (leaveId, filename) =>
  api.get(`/portal/my-leaves/${leaveId}/attachments/${filename}`, {
    responseType: 'blob',
  })

export const getMyQuotas = () => api.get('/portal/my-quotas')

export const getMyLeaveStats = () => api.get('/portal/my-leave-stats')

export const getMyWorkdayHours = (params) =>
  api.get('/portal/my-workday-hours', { params })

// ----- 加班 -----
export const getMyOvertimes = (params) =>
  api.get('/portal/my-overtimes', { params })

export const createMyOvertime = (data) => api.post('/portal/my-overtimes', data)

export const deleteMyOvertime = (id) => api.delete(`/portal/my-overtimes/${id}`)

// ----- 補打卡 -----
export const getMyPunchCorrections = (params) =>
  api.get('/portal/my-punch-corrections', { params })

export const createMyPunchCorrection = (data) =>
  api.post('/portal/my-punch-corrections', data)

// ----- 排班 -----
export const getMySchedule = (params) => api.get('/portal/my-schedule', { params })

export const getSwapRequests = () => api.get('/portal/swap-requests')

export const getSwapCandidates = (params) =>
  api.get('/portal/swap-candidates', { params })

export const createSwapRequest = (data) => api.post('/portal/swap-requests', data)

export const respondToSwap = (id, action) =>
  api.post(`/portal/swap-requests/${id}/respond`, { action })

export const cancelSwapRequest = (id) =>
  api.post(`/portal/swap-requests/${id}/cancel`)

// ----- 職務代理人 -----
export const respondToSubstitute = (leaveId, data) =>
  api.post(`/portal/my-leaves/${leaveId}/substitute-respond`, data)

export const getMySubstituteRequests = (params) =>
  api.get('/portal/my-substitute-requests', { params })
