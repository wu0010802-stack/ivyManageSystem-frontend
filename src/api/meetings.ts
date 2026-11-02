import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

export const getMeetings = (params: unknown) => api.get('/meetings', { params })

export const getMeetingSummary = (params: unknown) => api.get('/meetings/summary', { params })

/** 依每人當天排班預覽會議時數（mtgshift01）；未帶時段＝租戶設定，租戶沒設回空 items。 */
export const getMeetingShiftHours = (
  params: ApiQuery<'/meetings/shift-hours', 'get'>,
): AxiosResp<'/meetings/shift-hours', 'get'> => api.get('/meetings/shift-hours', { params })

export const createBatch = (data: unknown) => api.post('/meetings/batch', data)

export const updateMeeting = (id: number, data: unknown) => api.put(`/meetings/${id}`, data)

export const deleteMeeting = (id: number) => api.delete(`/meetings/${id}`)
