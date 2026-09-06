import api from './index'

export const getRecruitmentIvykidsBackendStatus = () => api.get('/recruitment/ivykids/status')
export const syncRecruitmentIvykidsBackend = (payload: unknown) => api.post('/recruitment/ivykids/sync', payload)
export const deleteRecruitmentIvykidsBackendRecords = () => api.delete('/recruitment/ivykids/records')
export const getRecruitmentIvykidsStats = () => api.get('/recruitment/ivykids/stats')
export const getRecruitmentIvykidsRecords = (params: unknown) => api.get('/recruitment/ivykids/records', { params })

/**
 * 把一筆官網報名轉成招生訪視（2026-09-06）。官網報名原本只被統計消費，
 * 沒有進入漏斗的路徑，要跟進得自己在訪視明細重打一次。
 */
export const convertIvykidsRecordToVisit = (recordId: number) =>
  api.post(`/recruitment/ivykids/records/${recordId}/to-visit`)
