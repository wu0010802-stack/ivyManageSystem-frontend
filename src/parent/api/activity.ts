import api from './index'
import type { ApiBody } from '../../api/_generated/typed'

export const listCourses = (params = {}) =>
  api.get('/parent/activity/courses', { params })

// ② 報名時段：沿用公開端（無需認證）設定，家長端報名前讀取以決定是否 disable 報名入口。
// 後端 register_courses 仍以 _check_registration_open 為硬閘，此處僅為前端 UX。
export const getRegistrationTime = () =>
  api.get('/activity/public/registration-time')

export const myRegistrations = () =>
  api.get('/parent/activity/my-registrations')

// 報名 payload 以 codegen 契約型別把關（抓 student_id/course_ids/supply_ids 等欄位
// 漂移）。GET 回傳維持鬆散：本 view 的 Course/Registration 為較嚴格的本地 interface
// （非 null），與 codegen 的 nullable 欄位接合會 cascade 進子元件 props，屬 parent
// home view 型別重構，留待後續（FE codegen 遷移既定邊界）。
export const registerCourses = (
  payload: ApiBody<'/parent/activity/register', 'post'>,
) => api.post('/parent/activity/register', payload)

export const confirmPromotion = (registrationId: number, courseId: number) =>
  api.post(`/parent/activity/registrations/${registrationId}/confirm-promotion`, {
    course_id: courseId,
  })

export const getRegistrationPayments = (registrationId: number) =>
  api.get(`/parent/activity/registrations/${registrationId}/payments`)

// 子女已佔位課程未來 days 天內的場次（hero upcomingCount / 下次上課）。
export const getUpcomingSessions = (days = 30) =>
  api.get('/parent/activity/upcoming-sessions', { params: { days } })

// 家長端首屏聚合：courses + my-registrations + upcoming-sessions + registration-time
// 一次回（4 GET 併 1，削報名尖峰對單 worker 後端的請求放大；對齊公開端 bootstrap）。
export const getActivityBootstrap = (days = 30) =>
  api.get('/parent/activity/bootstrap', { params: { days } })
