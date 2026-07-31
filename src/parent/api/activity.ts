import api from './index'
import type { ApiBody } from '../../api/_generated/typed'

export const listCourses = (params = {}) =>
  api.get('/parent/activity/courses', { params })

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

// 放棄候補升位：刪除該課程報名並釋出名額給下一位候補（設計審查 2026-07-28 補；
// 原本 LIFF 端只能 confirm，不想上課只能放到 48h 確認窗過期才遞補下一位）。
export const declinePromotion = (registrationId: number, courseId: number) =>
  api.post(`/parent/activity/registrations/${registrationId}/decline-promotion`, {
    course_id: courseId,
  })

// TODO(parent-portal): 後端支援單筆報名的繳費明細，前端尚無入口串接此端點
// （2026-07-31 家長端體檢：孤兒 API，非死碼，是功能缺口——見 activity 分頁
// 若要補「查看此筆報名的繳費紀錄」畫面，直接接這支）。
export const getRegistrationPayments = (registrationId: number) =>
  api.get(`/parent/activity/registrations/${registrationId}/payments`)

// 子女已佔位課程未來 days 天內的場次（hero upcomingCount / 下次上課）。
export const getUpcomingSessions = (days = 30) =>
  api.get('/parent/activity/upcoming-sessions', { params: { days } })

// 家長端首屏聚合：courses + my-registrations + upcoming-sessions + registration-time
// 一次回（4 GET 併 1，削報名尖峰對單 worker 後端的請求放大；對齊公開端 bootstrap）。
export const getActivityBootstrap = (days = 30) =>
  api.get('/parent/activity/bootstrap', { params: { days } })
