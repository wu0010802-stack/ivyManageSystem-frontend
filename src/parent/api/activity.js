import api from './index'

export const listCourses = (params = {}) =>
  api.get('/parent/activity/courses', { params })

export const myRegistrations = () =>
  api.get('/parent/activity/my-registrations')

export const registerCourses = (payload) =>
  api.post('/parent/activity/register', payload)

export const confirmPromotion = (registrationId, courseId) =>
  api.post(`/parent/activity/registrations/${registrationId}/confirm-promotion`, {
    course_id: courseId,
  })

export const getRegistrationPayments = (registrationId) =>
  api.get(`/parent/activity/registrations/${registrationId}/payments`)
