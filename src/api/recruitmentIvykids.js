import api from './index'

export const getRecruitmentIvykidsBackendStatus = () => api.get('/recruitment/ivykids/status')
export const syncRecruitmentIvykidsBackend = (payload) => api.post('/recruitment/ivykids/sync', payload)
export const deleteRecruitmentIvykidsBackendRecords = () => api.delete('/recruitment/ivykids/records')
export const getRecruitmentIvykidsStats = () => api.get('/recruitment/ivykids/stats')
export const getRecruitmentIvykidsRecords = (params) => api.get('/recruitment/ivykids/records', { params })
