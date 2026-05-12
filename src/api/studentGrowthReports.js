import api from './index'

const base = (studentId) => `/students/${studentId}/growth-reports`

export const listGrowthReports = (studentId, params = {}) =>
  api.get(base(studentId), { params })

export const getGrowthReport = (studentId, id) =>
  api.get(`${base(studentId)}/${id}`)

export const createGrowthReport = (studentId, payload) =>
  api.post(base(studentId), payload)

export const deleteGrowthReport = (studentId, id) =>
  api.delete(`${base(studentId)}/${id}`)

export const sendGrowthReportToLine = (studentId, id, payload = {}) =>
  api.post(`${base(studentId)}/${id}/send-line`, payload)

export const downloadGrowthReportUrl = (studentId, id) =>
  `${api.defaults.baseURL}${base(studentId)}/${id}/download`
