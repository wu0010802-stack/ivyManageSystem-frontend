import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

// ---- 管理端 ----
export const listSurveys = (params?: { status?: string }) => api.get('/surveys', { params })
export const getSurvey = (id: number) => api.get(`/surveys/${id}`)
export const createSurvey = (payload: ApiBody<'/surveys', 'post'>) => api.post('/surveys', payload)
export const updateSurvey = (id: number, payload: ApiBody<'/surveys/{survey_id}', 'put'>) =>
  api.put(`/surveys/${id}`, payload)
export const publishSurvey = (id: number) => api.post(`/surveys/${id}/publish`)
export const closeSurvey = (id: number) => api.post(`/surveys/${id}/close`)
export const deleteSurvey = (id: number) => api.delete(`/surveys/${id}`)
export async function getSurveyStats(id: number): AxiosResp<'/surveys/{survey_id}/stats', 'get'> {
  return api.get(`/surveys/${id}/stats`)
}
export const getSurveyResponses = (id: number) => api.get(`/surveys/${id}/responses`)
export const adminFillResponse = (
  id: number, studentId: number,
  payload: ApiBody<'/surveys/{survey_id}/responses/{student_id}', 'post'>,
) => api.post(`/surveys/${id}/responses/${studentId}`, payload)
export const remindSurvey = (id: number) => api.post(`/surveys/${id}/remind`)
export const exportSurvey = (id: number) =>
  api.get(`/surveys/${id}/export`, { responseType: 'blob' })

// ---- 教師端（portal 函式照慣例併在業務模組檔內） ----
export const listPortalSurveys = () => api.get('/portal/surveys')
export const getPortalSurveyClassStatus = (id: number) => api.get(`/portal/surveys/${id}/class-status`)
export const portalFillResponse = (
  id: number, studentId: number,
  payload: ApiBody<'/portal/surveys/{survey_id}/responses/{student_id}', 'post'>,
) => api.post(`/portal/surveys/${id}/responses/${studentId}`, payload)
export const portalRemindSurvey = (id: number) => api.post(`/portal/surveys/${id}/remind`)
