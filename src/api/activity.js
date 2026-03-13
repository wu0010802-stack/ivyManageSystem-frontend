import api from './index'

// 統計
export const getActivityStats = () => api.get('/activity/stats')
export const getActivityStatsSummary = () => api.get('/activity/stats-summary')
export const getActivityStatsCharts = () => api.get('/activity/stats-charts')
export const getActivityDashboardTable = () => api.get('/activity/dashboard-table')

// 報名
export const getRegistrations = (params) => api.get('/activity/registrations', { params })
export const getRegistrationDetail = (id) => api.get(`/activity/registrations/${id}`)
export const updatePayment = (id, data) => api.put(`/activity/registrations/${id}/payment`, data)
export const updateRemark = (id, data) => api.put(`/activity/registrations/${id}/remark`, data)
export const promoteWaitlist = (registrationId, courseId) =>
  api.put(`/activity/registrations/${registrationId}/waitlist`, null, { params: { course_id: courseId } })
export const deleteRegistration = (id) => api.delete(`/activity/registrations/${id}`)

// 課程
export const getCourses = () => api.get('/activity/courses')
export const getCourseDetail = (id) => api.get(`/activity/courses/${id}`)
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
export const deleteInquiry = (id) => api.delete(`/activity/inquiries/${id}`)

// 報名時間設定
export const getRegistrationTime = () => api.get('/activity/settings/registration-time')
export const updateRegistrationTime = (data) => api.post('/activity/settings/registration-time', data)

// 修改紀錄
export const getChanges = (params) => api.get('/activity/changes', { params })

// 班級選項
export const getClassOptions = () => api.get('/activity/class-options')
