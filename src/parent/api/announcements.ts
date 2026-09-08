import api from './index'

/**
 * 公告分類精簡資訊（對應後端 schemas/announcement_categories.py 的
 * `AnnouncementCategoryBriefOut`：id/name/icon/color，icon 為 Material Symbols
 * icon 名稱字串、color 為 hex 字串）。
 *
 * 家長端 `GET /parent/announcements` 目前未設 `response_model=`（回傳裸 dict），
 * gen:api 產出的型別是空殼，故手寫此型別而非等後端補齊 response_model。
 * TODO(ts-strict): waiting on backend response_model for /parent/announcements
 */
export interface AnnouncementCategoryBrief {
  id: number
  name: string
  icon?: string | null
  color?: string | null
}

export const listAnnouncements = (params = {}) =>
  api.get('/parent/announcements', { params })

export const getUnreadCount = () =>
  api.get('/parent/announcements/unread-count')

export const markRead = (id: number) =>
  api.post(`/parent/announcements/${id}/read`)
