import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

export interface PublicActivityTermParams {
  school_year: number
  semester: number
}

export const getPublicRegistrationTime = (): AxiosResp<'/activity/public/registration-time', 'get'> =>
  api.get('/activity/public/registration-time')
export const getPublicCourses = (): AxiosResp<'/activity/public/courses', 'get'> =>
  api.get('/activity/public/courses')
export const getPublicSupplies = (): AxiosResp<'/activity/public/supplies', 'get'> =>
  api.get('/activity/public/supplies')
export const getPublicClasses = (): AxiosResp<'/activity/public/classes', 'get'> =>
  api.get('/activity/public/classes')
export const getPublicCoursesAvailability = (
  params?: PublicActivityTermParams,
): AxiosResp<'/activity/public/courses/availability', 'get'> =>
  params
    ? api.get('/activity/public/courses/availability', { params })
    : api.get('/activity/public/courses/availability')
// 一次取回報名頁靜態資料（registration-time + courses + supplies + classes +
// course-videos），取代開頁時並發 5 支 GET（後端 30s 快取，穩定度稽核 2026-06-23）。
export const getPublicBootstrap = (
  params?: PublicActivityTermParams,
): AxiosResp<'/activity/public/bootstrap', 'get'> =>
  params
    ? api.get('/activity/public/bootstrap', { params })
    : api.get('/activity/public/bootstrap')
export const publicRegister = (
  data: ApiBody<'/activity/public/register', 'post'>,
): AxiosResp<'/activity/public/register', 'post'> =>
  api.post('/activity/public/register', data)
export const publicCreateInquiry = (
  data: ApiBody<'/activity/public/inquiries', 'post'>,
): AxiosResp<'/activity/public/inquiries', 'post'> =>
  api.post('/activity/public/inquiries', data)
export const publicQueryRegistration = (
  name: string,
  birthday: string,
  parent_phone: string,
): AxiosResp<'/activity/public/query', 'post'> =>
  api.post('/activity/public/query', { name, birthday, parent_phone })
// Phase 3：以查詢碼 + 家長手機查詢（POST 而非 GET，避免 token 進 access log / 瀏覽器歷史）
export const publicQueryByToken = (
  token: string,
  parent_phone: string,
): AxiosResp<'/activity/public/query-by-token', 'post'> =>
  api.post('/activity/public/query-by-token', { token, parent_phone })
export const publicUpdateRegistration = (
  data: ApiBody<'/activity/public/update', 'post'>,
): AxiosResp<'/activity/public/update', 'post'> =>
  api.post('/activity/public/update', data)
export const getPublicCourseVideos = (): AxiosResp<'/activity/public/course-videos', 'get'> =>
  api.get('/activity/public/course-videos')

export const publicConfirmPromotion = (
  registrationId: number,
  courseId: number,
  payload: ApiBody<'/activity/public/registrations/{registration_id}/courses/{course_id}/confirm-promotion', 'post'>,
): AxiosResp<'/activity/public/registrations/{registration_id}/courses/{course_id}/confirm-promotion', 'post'> =>
  api.post(
    `/activity/public/registrations/${registrationId}/courses/${courseId}/confirm-promotion`,
    payload,
  )
export const publicDeclinePromotion = (
  registrationId: number,
  courseId: number,
  payload: ApiBody<'/activity/public/registrations/{registration_id}/courses/{course_id}/decline-promotion', 'post'>,
): AxiosResp<'/activity/public/registrations/{registration_id}/courses/{course_id}/decline-promotion', 'post'> =>
  api.post(
    `/activity/public/registrations/${registrationId}/courses/${courseId}/decline-promotion`,
    payload,
  )
