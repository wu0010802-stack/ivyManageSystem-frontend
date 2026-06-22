import api from './index'

export const listCourses = (params = {}) =>
  api.get('/parent/activity/courses', { params })

// ② 報名時段：沿用公開端（無需認證）設定，家長端報名前讀取以決定是否 disable 報名入口。
// 後端 register_courses 仍以 _check_registration_open 為硬閘，此處僅為前端 UX。
export const getRegistrationTime = () =>
  api.get('/activity/public/registration-time')

export const myRegistrations = () =>
  api.get('/parent/activity/my-registrations')

export const registerCourses = (payload: unknown) =>
  api.post('/parent/activity/register', payload)

export const confirmPromotion = (registrationId: number, courseId: number) =>
  api.post(`/parent/activity/registrations/${registrationId}/confirm-promotion`, {
    course_id: courseId,
  })

export const getRegistrationPayments = (registrationId: number) =>
  api.get(`/parent/activity/registrations/${registrationId}/payments`)
