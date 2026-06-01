import api from './index'

export const getPublicRegistrationTime = () =>
  api.get('/activity/public/registration-time')
export const getPublicCourses = () =>
  api.get('/activity/public/courses')
export const getPublicSupplies = () =>
  api.get('/activity/public/supplies')
export const getPublicClasses = () =>
  api.get('/activity/public/classes')
export const getPublicCoursesAvailability = () =>
  api.get('/activity/public/courses/availability')
export const publicRegister = (data: unknown) =>
  api.post('/activity/public/register', data)
export const publicCreateInquiry = (data: unknown) =>
  api.post('/activity/public/inquiries', data)
export const publicQueryRegistration = (name: string, birthday: string, parent_phone: string) =>
  api.post('/activity/public/query', { name, birthday, parent_phone })
// Phase 3：以查詢碼 + 家長手機查詢（POST 而非 GET，避免 token 進 access log / 瀏覽器歷史）
export const publicQueryByToken = (token: string, parent_phone: string) =>
  api.post('/activity/public/query-by-token', { token, parent_phone })
export const publicUpdateRegistration = (data: unknown) =>
  api.post('/activity/public/update', data)
export const getPublicCourseVideos = () =>
  api.get('/activity/public/course-videos')

export const publicConfirmPromotion = (registrationId: number, courseId: number, payload: unknown) =>
  api.post(
    `/activity/public/registrations/${registrationId}/courses/${courseId}/confirm-promotion`,
    payload,
  )
export const publicDeclinePromotion = (registrationId: number, courseId: number, payload: unknown) =>
  api.post(
    `/activity/public/registrations/${registrationId}/courses/${courseId}/decline-promotion`,
    payload,
  )
