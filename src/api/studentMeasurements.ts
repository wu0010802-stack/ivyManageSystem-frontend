import api from './index'

const base = (studentId: number) => `/students/${studentId}/measurements`

export const listMeasurements = (studentId: number, params: unknown = {}) =>
  api.get(base(studentId), { params })

export const createMeasurement = (studentId: number, payload: unknown) =>
  api.post(base(studentId), payload)

export const updateMeasurement = (studentId: number, id: number, payload: unknown) =>
  api.patch(`${base(studentId)}/${id}`, payload)

export const deleteMeasurement = (studentId: number, id: number) =>
  api.delete(`${base(studentId)}/${id}`)

export const fetchMeasurementChart = (studentId: number, params: unknown = {}) =>
  api.get(`${base(studentId)}/chart-data`, { params })
