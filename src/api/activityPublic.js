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
export const publicRegister = (data) =>
  api.post('/activity/public/register', data)
export const publicCreateInquiry = (data) =>
  api.post('/activity/public/inquiries', data)
export const publicQueryRegistration = (name, birthday, parent_phone) =>
  api.get('/activity/public/query', { params: { name, birthday, parent_phone } })
export const publicUpdateRegistration = (data) =>
  api.post('/activity/public/update', data)
export const getPublicCourseVideos = () =>
  api.get('/activity/public/course-videos')

export const publicConfirmPromotion = (registrationId, courseId, payload) =>
  api.post(
    `/activity/public/registrations/${registrationId}/courses/${courseId}/confirm-promotion`,
    payload,
  )
export const publicDeclinePromotion = (registrationId, courseId, payload) =>
  api.post(
    `/activity/public/registrations/${registrationId}/courses/${courseId}/decline-promotion`,
    payload,
  )
