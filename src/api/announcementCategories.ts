import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

// 公告分類（AnnouncementCategory）CRUD —— api/announcement_categories.py 對應。
// 權限沿用 ANNOUNCEMENTS_READ/WRITE，見 src/constants/navigation/manifest.ts。

export const getAnnouncementCategories = (): AxiosResp<'/announcement-categories', 'get'> =>
  api.get('/announcement-categories')

export const createAnnouncementCategory = (
  data: ApiBody<'/announcement-categories', 'post'>
): AxiosResp<'/announcement-categories', 'post'> => api.post('/announcement-categories', data)

export const updateAnnouncementCategory = (
  id: number,
  data: ApiBody<'/announcement-categories/{category_id}', 'put'>
): AxiosResp<'/announcement-categories/{category_id}', 'put'> =>
  api.put(`/announcement-categories/${id}`, data)

export const deleteAnnouncementCategory = (
  id: number
): AxiosResp<'/announcement-categories/{category_id}', 'delete'> =>
  api.delete(`/announcement-categories/${id}`)
