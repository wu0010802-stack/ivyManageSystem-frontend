import api from './index'

const base = (studentId) => `/students/${studentId}/measurements`

export const listMeasurements = (studentId, params = {}) =>
  api.get(base(studentId), { params })

export const createMeasurement = (studentId, payload) =>
  api.post(base(studentId), payload)

export const updateMeasurement = (studentId, id, payload) =>
  api.patch(`${base(studentId)}/${id}`, payload)

export const deleteMeasurement = (studentId, id) =>
  api.delete(`${base(studentId)}/${id}`)

export const fetchMeasurementChart = (studentId, params = {}) =>
  api.get(`${base(studentId)}/chart-data`, { params })
