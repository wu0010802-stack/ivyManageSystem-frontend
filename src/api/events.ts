import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

export const getEvents = (
  params?: ApiQuery<'/events', 'get'>,
): AxiosResp<'/events', 'get'> => api.get('/events', { params })

export const getEvent = (id: number): AxiosResp<'/events/{event_id}', 'get'> =>
  api.get(`/events/${id}`)

export const getCalendarFeed = (
  params: ApiQuery<'/events/calendar-feed', 'get'>,
): AxiosResp<'/events/calendar-feed', 'get'> =>
  api.get('/events/calendar-feed', { params })

export const createEvent = (
  data: ApiBody<'/events', 'post'>,
): AxiosResp<'/events', 'post'> => api.post('/events', data)

export const updateEvent = (
  id: number,
  data: ApiBody<'/events/{event_id}', 'put'>,
): AxiosResp<'/events/{event_id}', 'put'> => api.put(`/events/${id}`, data)

export const deleteEvent = (id: number): AxiosResp<'/events/{event_id}', 'delete'> =>
  api.delete(`/events/${id}`)

// ----- 分校行事曆 XLSX 匯入（calimp01）-----
// 兩段式：preview 只驗證不寫 DB → 使用者確認（parent 可見必須逐列/批次明確
// 確認）→ commit（server 重新驗證；同 source_row_key 冪等 update）
export const importEventsPreview = (
  formData: FormData,
): AxiosResp<'/events/import-preview', 'post'> =>
  api.post('/events/import-preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

export const importEventsCommit = (
  data: ApiBody<'/events/import-commit', 'post'>,
): AxiosResp<'/events/import-commit', 'post'> =>
  api.post('/events/import-commit', data)

// 假日批次匯入
export const getHolidayImportTemplate = () =>
  api.get('/events/holidays/import-template', { responseType: 'blob' })

export const importHolidays = (formData: FormData) =>
  api.post('/events/holidays/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
