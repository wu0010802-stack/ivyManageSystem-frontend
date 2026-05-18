import api from './index'

const base = (studentId: number) => `/students/${studentId}/growth-reports`

export const listGrowthReports = (studentId: number, params: unknown = {}) =>
  api.get(base(studentId), { params })

export const getGrowthReport = (studentId: number, id: number) =>
  api.get(`${base(studentId)}/${id}`)

export const createGrowthReport = (studentId: number, payload: unknown) =>
  api.post(base(studentId), payload)

export const deleteGrowthReport = (studentId: number, id: number) =>
  api.delete(`${base(studentId)}/${id}`)

export const sendGrowthReportToLine = (studentId: number, id: number, payload: unknown = {}) =>
  api.post(`${base(studentId)}/${id}/send-line`, payload)

export const downloadGrowthReportUrl = (studentId: number, id: number) =>
  `${api.defaults.baseURL}${base(studentId)}/${id}/download`
