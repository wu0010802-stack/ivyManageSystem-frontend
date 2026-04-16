import api from './index'

// 統計
export const getActivityStats = () => api.get('/activity/stats')
export const getActivityStatsSummary = () => api.get('/activity/stats-summary')
export const getActivityStatsCharts = () => api.get('/activity/stats-charts')
export const getActivityDashboardTable = (params) => api.get('/activity/dashboard-table', { params })

// 報名
export const getRegistrations = (params) => api.get('/activity/registrations', { params })
export const getRegistrationDetail = (id) => api.get(`/activity/registrations/${id}`)
export const updateRemark = (id, data) => api.put(`/activity/registrations/${id}/remark`, data)
export const promoteWaitlist = (registrationId, courseId) =>
  api.put(`/activity/registrations/${registrationId}/waitlist`, null, { params: { course_id: courseId } })
export const withdrawCourse = (registrationId, courseId) =>
  api.delete(`/activity/registrations/${registrationId}/courses/${courseId}`)
export const deleteRegistration = (id) => api.delete(`/activity/registrations/${id}`)
export const batchUpdatePayment = (ids, isPaid) =>
  api.put('/activity/registrations/batch-payment', { ids, is_paid: isPaid })
export const getRegistrationPayments = (id) =>
  api.get(`/activity/registrations/${id}/payments`)
export const addRegistrationPayment = (id, data) =>
  api.post(`/activity/registrations/${id}/payments`, data)
export const deleteRegistrationPayment = (registrationId, paymentId) =>
  api.delete(`/activity/registrations/${registrationId}/payments/${paymentId}`)
export const exportRegistrations = (params) =>
  api.get('/activity/registrations/export', { params, responseType: 'blob' })

// 課程
export const getCourses = () => api.get('/activity/courses')
export const getCourseDetail = (id) => api.get(`/activity/courses/${id}`)
export const getCourseWaitlist = (courseId) => api.get(`/activity/courses/${courseId}/waitlist`)
export const createCourse = (data) => api.post('/activity/courses', data)
export const updateCourse = (id, data) => api.put(`/activity/courses/${id}`, data)
export const deleteCourse = (id) => api.delete(`/activity/courses/${id}`)

// 用品
export const getSupplies = () => api.get('/activity/supplies')
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

// 修改紀錄
export const getChanges = (params) => api.get('/activity/changes', { params })

// 班級選項
export const getClassOptions = () => api.get('/activity/class-options')

// 統計表匯出
export const exportDashboardTable = (params) =>
  api.get('/activity/dashboard-table/export', { params, responseType: 'blob' })

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
export const getAttendanceSession = (id) =>
  api.get(`/activity/attendance/sessions/${id}`)
export const batchUpdateAttendance = (id, records) =>
  api.put(`/activity/attendance/sessions/${id}/records`, { records })

export const exportAttendanceSession = (id) =>
  api.get(`/activity/attendance/sessions/${id}/export`, { responseType: 'blob' })

// Portal - 才藝點名
export const getPortalAttendanceSessions = (params) =>
  api.get('/portal/activity/attendance/sessions', { params })
export const getPortalAttendanceSession = (id) =>
  api.get(`/portal/activity/attendance/sessions/${id}`)
export const batchUpdatePortalAttendance = (id, records) =>
  api.put(`/portal/activity/attendance/sessions/${id}/records`, { records })
