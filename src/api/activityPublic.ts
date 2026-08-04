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
// 以查詢碼 + 家長手機查詢（POST 而非 GET，避免 token 進 access log / 瀏覽器歷史）。
// 2026-08-03：三欄（姓名+生日+手機）查詢已移除，查詢碼是公開端唯一查詢方式。
export const publicQueryByToken = (
  token: string,
  parent_phone: string,
): AxiosResp<'/activity/public/query-by-token', 'post'> =>
  api.post('/activity/public/query-by-token', { token, parent_phone })
// 忘記查詢碼時，以學生姓名＋班級＋家長手機做唯讀查詢（2026-08-04）。生日欄已
// 移除，這三欄是報名表上僅存的身分欄位。業主裁定：三欄比對成功只能檢視，畫面
// 永遠不顯示查詢碼；報名當初有留 email 時後端順便把查詢碼寄到該信箱
// （token_email_sent + masked_email）。
export const publicQueryByIdentity = (
  data: ApiBody<'/activity/public/query-by-identity', 'post'>,
): AxiosResp<'/activity/public/query-by-identity', 'post'> =>
  api.post('/activity/public/query-by-identity', data)
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
